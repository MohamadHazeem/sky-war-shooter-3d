"""Offline regression tests: no torch, downloads, or production asset writes."""
import array
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch, MagicMock
import wave

spec = importlib.util.spec_from_file_location('voice_generate', Path(__file__).with_name('generate.py'))
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.cfg = g.load()
        self.clips = g.expand(self.cfg)

    def test_reference_cast_and_flac_format(self):
        sources = json.loads(Path(g.HERE, 'refs/sources.json').read_text())
        self.assertEqual(set(sources), set(self.cfg['roles']))
        self.assertEqual(len({v['speaker'] for v in sources.values()}), 17)
        for role, info in sources.items():
            self.assertEqual(info['gender'], 'M')
            self.assertTrue(3 <= len(info['sources']) <= 5)
            data = Path(g.HERE, self.cfg['roles'][role]['ref']).read_bytes()
            self.assertEqual(data[:4], b'fLaC')
            # STREAMINFO's packed sample rate/channels/bit depth/frame count.
            packed = int.from_bytes(data[18:26], 'big')
            sr, channels = packed >> 44, ((packed >> 41) & 7) + 1
            frames = packed & ((1 << 36) - 1)
            self.assertEqual((sr, channels), (24000, 1))
            self.assertTrue(10 <= frames / sr <= 12)
            self.assertAlmostEqual(frames / sr, info['duration'], places=3)

    def test_emotion_and_overrides(self):
        normal = next(c for c in self.clips if c['role'] != 'briefing' and c['exa'] == .55)
        clock = next(c for c in self.clips if c['kind'] == 'clock')
        briefing = next(c for c in self.clips if c['role'] == 'briefing')
        self.assertEqual((normal['exa'], normal['cfg']), (.55, .5))
        self.assertEqual((clock['exa'], clock['cfg']), (.8, .3))
        self.assertEqual((briefing['exa'], briefing['cfg']), (.4, .5))
        self.cfg['lines'] = [dict(id='test', role='pilot', text='Hello!', urgent=True, exa=.7, cfg=.2)]
        self.assertEqual((g.expand(self.cfg)[0]['exa'], g.expand(self.cfg)[0]['cfg']), (.7, .2))

    def test_hash_and_role_invalidation(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(g, 'HERE', tmp):
            for role in self.cfg['roles']:
                Path(tmp, role).write_bytes(role.encode())
                self.cfg['roles'][role]['ref'] = role
            self.cfg['audio']['engine'] = 'chatterbox'
            before = {c['id']: g.clip_hash(c, self.cfg) for c in self.clips}
            Path(tmp, 'pilot').write_bytes(b'new speaker')
            for c in self.clips:
                self.assertEqual(before[c['id']] != g.clip_hash(c, self.cfg), c['role'] == 'pilot')
            c = self.clips[0]
            h = g.clip_hash(c, self.cfg)
            self.assertNotEqual(h, g.clip_hash(dict(c, exa=.123), self.cfg))
            self.assertNotEqual(h, g.clip_hash(dict(c, cfg=.123), self.cfg))
            self.cfg['audio']['engine'] = 'say'
            key = f"3|{self.cfg['roles'][c['role']]['voice']}|{c['rate']}|{c['spoken']}|{self.cfg['audio']['sampleRate']}|{g.bitrate(c, self.cfg)}"
            self.assertEqual(g.clip_hash(c, self.cfg), hashlib.sha1(key.encode()).hexdigest()[:10])
            self.assertNotEqual(h, g.clip_hash(c, self.cfg))

    def test_check_does_not_hide_new_missing_templates(self):
        fn, body = next(iter(g.DYNAMIC_CALLOUTS))
        with patch.object(g, 'callout_texts', return_value=[(fn, body, __import__('re').compile('^never$'))]):
            self.assertTrue(g.check(self.clips))
        for body, rx in [('Missing new line!', None), ('New ${name} template!', __import__('re').compile('^never$'))]:
            with patch.object(g, 'callout_texts', return_value=[('New.ts', body, rx)]):
                self.assertFalse(g.check(self.clips))

    def test_dynamic_mapping_requires_real_clip(self):
        fn, body = next(iter(g.DYNAMIC_CALLOUTS))
        mapped = {r['clip'] for r in self.cfg['dynamic'] if (r['source'], r['template']) == (fn, body)}
        reduced = [c for c in self.clips if c['id'] not in mapped]
        with patch.object(g, 'callout_texts', return_value=[(fn, body, __import__('re').compile('^never$'))]):
            self.assertFalse(g.check(reduced))

    def test_optional_peak_headroom_invalidates_only_selected_clips(self):
        c = next(c for c in self.clips if c['id'].startswith('ss_'))
        self.assertEqual(c['peakDb'], -3)
        self.assertNotEqual(g.clip_hash(c, self.cfg), g.clip_hash(dict(c, peakDb=-4), self.cfg))
        with tempfile.TemporaryDirectory() as tmp:
            raw, cut = Path(tmp, 'raw.wav'), Path(tmp, 'cut.wav')
            with wave.open(str(raw), 'wb') as w:
                w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
                w.writeframes(array.array('h', [10000, -10000] * 16000).tobytes())
            g.trim_normalise(str(raw), str(cut), 16000, -3)
            self.assertAlmostEqual(g.audio_metrics(cut, 'one two three')['peakDb'], -3, places=1)

    def test_selection(self):
        self.assertEqual(len(g.select_clips(self.clips, ['pilot'], 3)), 3)
        self.assertTrue(all(c['role'] == 'pilot' for c in g.select_clips(self.clips, ['pilot'], None)))
        self.assertTrue(all(c['id'].startswith('brief_') for c in g.select_clips(self.clips, ['brief_'], 3)))
        self.assertEqual(g.select_clips(self.clips, None, 0), [])
        with self.assertRaises(ValueError):
            g.select_clips(self.clips, ['typo'], 3)

    def test_quality_silence_and_duration(self):
        with tempfile.TemporaryDirectory() as tmp:
            raw, cut = Path(tmp, 'raw.wav'), Path(tmp, 'cut.wav')
            with wave.open(str(raw), 'wb') as w:
                w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
                w.writeframes(array.array('h', [0] * 16000 + [1000, -1000] * 16000 + [0] * 16000).tobytes())
            g.trim_normalise(str(raw), str(cut), 16000)
            q = g.audio_metrics(cut, 'One two three four five six')
            self.assertTrue(q['durationOK'])
            self.assertAlmostEqual(q['peakDb'], -1.01, places=1)
            self.assertLess(q['silenceFraction'], .1)
            self.assertFalse(g.audio_metrics(cut, 'One')['durationOK'])
            self.assertFalse(g.audio_metrics(cut, 'word ' * 100)['durationOK'])

    def test_chatterbox_retry_seeds_and_atomic_rejection(self):
        c = dict(self.clips[0], spoken='One two three four five six')
        cfg = copy.deepcopy(self.cfg)
        cfg['roles'][c['role']]['ref'] = 'ref.flac'
        torch, ta, sf = MagicMock(), MagicMock(), MagicMock()
        model = MagicMock(sr=24000)
        def pcm(path, data, sr, **kw):
            with wave.open(str(path), 'wb') as w:
                w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
                n = 100 if sf.write.call_count < 3 else sr * 2
                w.writeframes(array.array('h', [1000, -1000] * (n // 2)).tobytes())
        sf.write.side_effect = pcm
        def encode(args, **kw):
            Path(args[-1]).write_bytes(b'encoded')
        with tempfile.TemporaryDirectory() as tmp, patch.object(g, 'OUT', tmp), patch.dict(sys.modules, {'torch': torch, 'torchaudio': ta, 'soundfile': sf}), patch.object(g.subprocess, 'run', side_effect=encode), patch.object(g, 'slim_m4a'):
            dur, q = g.render(c, cfg, tmp, model)
            self.assertEqual(q['retries'], 2)
            self.assertEqual(model.generate.call_count, 3)
            seeds = [call.args[0] for call in torch.manual_seed.call_args_list]
            self.assertEqual(len(set(seeds)), 3)
            self.assertEqual(ta.functional.resample.call_args.args[1:], (24000, 16000))
            self.assertEqual(Path(tmp, c['id'] + '.m4a').read_bytes(), b'encoded')
            sf.write.reset_mock()
            model.generate.reset_mock()
            # Reject every take. Existing output must survive untouched.
            with patch.object(g, 'audio_metrics', return_value={'durationOK': False, 'duration': 50}):
                with self.assertRaises(g.RenderRejected):
                    g.render(c, cfg, tmp, model)
            self.assertEqual(model.generate.call_count, 4)
            self.assertEqual(Path(tmp, c['id'] + '.m4a').read_bytes(), b'encoded')

    def test_partial_force_resume_and_failure(self):
        cfg = copy.deepcopy(self.cfg)
        cfg['audio']['engine'] = 'say'
        clips = self.clips[:3]
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp, 'audio'); out.mkdir()
            original = {}
            for c in clips:
                Path(out, c['id'] + '.m4a').write_bytes(b'old')
                original[c['id']] = dict(file=c['id'] + '.m4a', role=c['role'], text=c['text'], dur=1, h='old')
            g.atomic_json(out / 'manifest.json', {'clips': original})
            Path(out, 'unrelated.m4a').write_bytes(b'untouched')
            def fake(c, cfg, tmp, model):
                Path(out, c['id'] + '.m4a').write_bytes(b'new')
                return 2, {}
            with patch.multiple(g, OUT=str(out), HERE=tmp, TS_OUT=str(Path(tmp, 'table.ts'))), patch.object(g, 'load', return_value=cfg), patch.object(g, 'expand', return_value=clips), patch.object(g, 'check', return_value=True), patch.object(g, 'render', side_effect=fake) as render:
                with patch.object(sys, 'argv', ['generate.py', '--only', clips[0]['id'], '--limit', '1', '--force']):
                    self.assertEqual(g.main(), 0)
                result = json.loads((out / 'manifest.json').read_text())['clips']
                self.assertEqual(result[clips[1]['id']], original[clips[1]['id']])
                self.assertEqual(Path(out, 'unrelated.m4a').read_bytes(), b'untouched')
                with patch.object(sys, 'argv', ['generate.py', '--only', clips[0]['id'], '--limit', '1']):
                    self.assertEqual(g.main(), 0)
                self.assertEqual(render.call_count, 1)
                render.side_effect = g.RenderRejected('bad', {'durationOK': False})
                with patch.object(sys, 'argv', ['generate.py', '--only', clips[1]['id'], '--limit', '1']):
                    self.assertEqual(g.main(), 1)
                self.assertEqual(json.loads((out / 'manifest.json').read_text())['clips'][clips[1]['id']], original[clips[1]['id']])

    def test_lines_d_groups_sorted_before_briefings(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = dict(roles={}, lines=[{'group': 'old'}, {'id': 'x'}, {'group': g.BRIEFINGS_GROUP}, {'id': 'brief'}])
            Path(tmp, 'lines.json').write_text(json.dumps(base))
            self.assertEqual(g.load(tmp), base)  # no lines.d: unchanged
            Path(tmp, 'lines.d').mkdir()
            Path(tmp, 'lines.d', 'b-goal.json').write_text(json.dumps([{'group': 'b'}, {'id': 'b1'}]))
            Path(tmp, 'lines.d', 'a-goal.json').write_text(json.dumps([{'group': 'a'}, {'id': 'a1'}, {'id': 'a2'}]))
            Path(tmp, 'lines.d', 'notes.txt').write_text('ignored')
            order = [l.get('id', l.get('group')) for l in g.load(tmp)['lines']]
            self.assertEqual(order, ['old', 'x', 'a', 'a1', 'a2', 'b', 'b1', g.BRIEFINGS_GROUP, 'brief'])
            Path(tmp, 'lines.d', 'c-bad.json').write_text(json.dumps([{'id': 'no header'}]))
            with self.assertRaises(SystemExit):
                g.load(tmp)

    def test_shipped_lines_d_keeps_existing_hashes(self):
        """Every clip in lines.json renders with the same id and hash whatever lines.d adds."""
        with open(Path(g.HERE, 'lines.json'), encoding='utf-8') as f:
            plain = json.load(f)
        merged = g.load()
        before = {c['id']: g.clip_hash(c, plain) for c in g.expand(plain)}
        after = {c['id']: g.clip_hash(c, merged) for c in g.expand(merged)}
        self.assertEqual({k: after[k] for k in before}, before)
        at = next(i for i, l in enumerate(plain['lines']) if l.get('group') == g.BRIEFINGS_GROUP)
        tail = len(plain['lines']) - at
        self.assertEqual(merged['lines'][:at], plain['lines'][:at])
        self.assertEqual(merged['lines'][-tail:], plain['lines'][at:])


if __name__ == '__main__':
    unittest.main()
