import * as T from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { JITTER } from './TemporalMath';

const vert = 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
const reconstruct = /* glsl */ `
uniform sampler2D tDepth; uniform mat4 invProj; uniform float reversed; varying vec2 vUv;
vec3 viewAt(vec2 uv){float d=texture2D(tDepth,uv).r;vec4 p=invProj*vec4(uv*2.-1.,reversed>.5?max(d,1e-7):d*2.-1.,1.);return p.xyz/p.w;}
bool skyAt(vec2 uv){float d=texture2D(tDepth,uv).r;return reversed>.5?d<=0.:d>=1.;}
`;
interface MotionRecord { previous: T.Matrix4; current: T.Matrix4; last: number; queued: number }
const rt = (depthBuffer = false) => new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, depthBuffer });

// Object/camera motion vectors, half-res temporal SSAO, HDR neighbourhood-clipped TAA.
// Buffers and matrix records are reused; first-seen objects allocate only during prewarm/spawn.
export class TemporalFrame {
  enabled = true;
  readonly jitter = new T.Vector2();
  ao = .6;
  private velocity = rt(true);
  private aoHistory = [rt(), rt()];
  private colorHistory = [rt(), rt()];
  private index = 0;
  private frame = 0;
  private valid = false;
  private previous = new WeakMap<T.Object3D, MotionRecord>();
  private pending: MotionRecord[] = [];
  private prevVP = new T.Matrix4();
  private vp = new T.Matrix4();
  private projection = new T.Matrix4();
  private projectionReversed = false;
  private prevCamera = new T.Matrix4();
  private pos = new T.Vector3();
  private lastPos = new T.Vector3();
  private rot = new T.Quaternion();
  private lastRot = new T.Quaternion();
  private lastFov = 0;
  private quad = new FullScreenQuad();
  private motion: T.ShaderMaterial;
  private ambient: T.ShaderMaterial;
  private resolve: T.ShaderMaterial;


  constructor(reversed: boolean) {
    this.motion = new T.ShaderMaterial({
      uniforms: { prevMVP: { value: new T.Matrix4() }, prevMV: { value: new T.Matrix4() }, known: { value: 0 } },
      vertexShader: /* glsl */ `
        uniform mat4 prevMVP; uniform mat4 prevMV; varying vec4 oldClip; varying vec4 curClip; varying float oldDepth;
        void main(){vec4 p=vec4(position,1.);
        #ifdef USE_INSTANCING
          p=instanceMatrix*p;
        #endif
        oldClip=prevMVP*p;oldDepth=-(prevMV*p).z*.001;curClip=projectionMatrix*modelViewMatrix*p;gl_Position=curClip;}`,
      fragmentShader: /* glsl */ `
        uniform float known; varying vec4 oldClip; varying vec4 curClip; varying float oldDepth;
        void main(){vec2 delta=(oldClip.xy/oldClip.w-curClip.xy/curClip.w)*.5;gl_FragColor=vec4(delta,oldDepth,known);}`,
      side: T.DoubleSide,
    });
    this.motion.onBeforeRender = (_r, _s, _c, _g, object) => {
      let record = this.previous.get(object);
      if (!record) {
        record = { previous: object.matrixWorld.clone(), current: object.matrixWorld, last: -1, queued: -1 };
        this.previous.set(object, record);
      }
      const u = this.motion.uniforms, known = this.valid && record.last === this.frame - 1;
      u.prevMVP.value.multiplyMatrices(this.prevVP, known ? record.previous : object.matrixWorld);
      u.prevMV.value.multiplyMatrices(this.prevCamera, known ? record.previous : object.matrixWorld);
      u.known.value = known ? 1 : 0;
      if (record.queued !== this.frame) { this.pending.push(record); record.queued = this.frame; }
      this.motion.uniformsNeedUpdate = true;
    };
    const common = () => ({ tDepth: { value: null }, invProj: { value: new T.Matrix4() }, reversed: { value: reversed ? 1 : 0 },
      tMotion: { value: this.velocity.texture }, tHistory: { value: null }, valid: { value: 0 }, texel: { value: new T.Vector2() } });
    this.ambient = new T.ShaderMaterial({
      uniforms: { ...common(), frame: { value: 0 } }, vertexShader: vert, depthTest: false, depthWrite: false,
      fragmentShader: /* glsl */ `${reconstruct}
        uniform sampler2D tMotion,tHistory;uniform float valid,frame;uniform vec2 texel;
        void main(){vec3 p=viewAt(vUv);float d=-p.z*.001;
          if(skyAt(vUv)||-p.z>180.){gl_FragColor=vec4(1.,d,0.,1.);return;}
          // Derivative normal from the nearer depth neighbour avoids silhouette normals.
          vec3 l=viewAt(vUv-vec2(texel.x,0.))-p,r=viewAt(vUv+vec2(texel.x,0.))-p;
          vec3 b=viewAt(vUv-vec2(0.,texel.y))-p,t=viewAt(vUv+vec2(0.,texel.y))-p;
          vec3 n=normalize(cross(abs(l.z)<abs(r.z)?-l:r,abs(b.z)<abs(t.z)?-b:t));
          if(dot(n,-p)<0.)n=-n;
          float radius=.65;float screenRadius=clamp(radius/max(.001,-p.z*invProj[1][1]),texel.y*2.,.12);
          float sum=0.;float angle=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)+frame*.125;
          for(int i=0;i<8;i++){float a=(float(i)/8.+angle)*6.283185;vec2 uv=vUv+vec2(cos(a)*texel.x/texel.y,sin(a))*screenRadius*(.3+.7*float(i+1)/8.);
            vec3 delta=viewAt(uv)-p;float len=length(delta);
            sum+=max(0.,dot(n,delta/max(len,.001))-.12)*(1.-smoothstep(radius*.3,radius*2.,len));}
          float ao=clamp(1.-sum*.22,.25,1.);vec4 motion=texture2D(tMotion,vUv);vec2 prev=vUv+motion.xy;vec2 history=texture2D(tHistory,prev).rg;
          bool accept=valid>.5&&motion.a>.5&&all(greaterThan(prev,vec2(0.)))&&all(lessThan(prev,vec2(1.)))&&abs(history.g-motion.z)<max(.002,motion.z*.025);
          if(accept)ao=mix(ao,clamp(history.r,ao-.15,ao+.15),.85);
          gl_FragColor=vec4(ao,d,0.,1.);}`,
    });
    this.resolve = new T.ShaderMaterial({
      uniforms: { ...common(), tColor: { value: null }, tAO: { value: null }, aoStrength: { value: .6 }, prevVP: { value: this.prevVP }, camWorld: { value: new T.Matrix4() } },
      vertexShader: vert, depthTest: false, depthWrite: false,
      fragmentShader: /* glsl */ `${reconstruct}
        uniform sampler2D tColor,tMotion,tHistory,tAO;uniform float valid,aoStrength;uniform vec2 texel;uniform mat4 prevVP,camWorld;
        vec3 compress(vec3 c){return c/(1.+max(c.r,max(c.g,c.b)));}
        vec3 expand(vec3 c){return c/max(.001,1.-max(c.r,max(c.g,c.b)));}
        void main(){vec3 p=viewAt(vUv);bool sky=skyAt(vUv);float d=sky?260.:-p.z*.001;
          vec4 motion=texture2D(tMotion,vUv);vec2 prev=vUv+motion.xy;
          if(sky){vec4 clip=prevVP*vec4(mat3(camWorld)*normalize(p)*1e6+camWorld[3].xyz,1.);prev=clip.xy/clip.w*.5+.5;}
          // Depth-aware half-res AO upsample (four neighbours, no dark silhouette halo).
          float occ=0.,ws=0.;for(int i=0;i<4;i++){vec2 o=vec2(float(i%2)-.5,float(i/2)-.5)*texel*2.;vec2 a=texture2D(tAO,vUv+o).rg;float w=1./(1.+abs(a.g-d)*2000.);occ+=a.r*w;ws+=w;}
          float factor=sky?1.:mix(1.,occ/max(ws,.001),aoStrength);
          vec3 raw=texture2D(tColor,vUv).rgb*factor,c=compress(raw),lo=c,hi=c;
          for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec3 s=compress(texture2D(tColor,vUv+vec2(x,y)*texel).rgb*factor);lo=min(lo,s);hi=max(hi,s);}
          vec4 hist=texture2D(tHistory,prev);vec3 h=clamp(compress(hist.rgb),lo,hi);
          bool inside=all(greaterThan(prev,vec2(0.)))&&all(lessThan(prev,vec2(1.)));
          bool depthOK=sky?hist.a>250.:(motion.a>.5&&abs(hist.a-motion.z)<max(.002,motion.z*.025));
          float reactive=clamp(length(c-h)*5.,0.,1.);float weight=valid*float(inside&&depthOK)*mix(.9,.25,reactive);
          // Transparent HDR effects have no reliable motion: reduce history near high-energy transients.
          weight*=1.-smoothstep(2.,8.,max(raw.r,max(raw.g,raw.b)))*.85;
          c=expand(mix(c,h,weight));
          gl_FragColor=vec4(c,d);}`,
    });
  }

  setSize(w: number, h: number) {
    this.velocity.setSize(w, h);
    for (const r of this.colorHistory) r.setSize(w, h);
    for (const r of this.aoHistory) r.setSize(Math.max(1, Math.ceil(w / 2)), Math.max(1, Math.ceil(h / 2)));
    this.ambient.uniforms.texel.value.set(2 / w, 2 / h);
    this.resolve.uniforms.texel.value.set(1 / w, 1 / h);
    this.reset();
  }
  reset() { this.valid = false; }
  begin(camera: T.PerspectiveCamera) {
    this.jitter.set(0, 0);
    if (!this.enabled) return;
    camera.getWorldPosition(this.pos); camera.getWorldQuaternion(this.rot);
    if (this.pos.distanceToSquared(this.lastPos) > 400 || Math.abs(this.rot.dot(this.lastRot)) < .96 || Math.abs(camera.fov - this.lastFov) > 2) this.reset();
    this.lastPos.copy(this.pos); this.lastRot.copy(this.rot); this.lastFov = camera.fov;
    this.projectionReversed = camera.reversedDepth;
    this.projection.copy(camera.projectionMatrix);
    const jitter = JITTER[this.frame % JITTER.length];
    this.jitter.set(jitter[0] * 2 / this.velocity.width, jitter[1] * 2 / this.velocity.height);
    camera.projectionMatrix.elements[8] += this.jitter.x;
    camera.projectionMatrix.elements[9] += this.jitter.y;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
  end(camera: T.PerspectiveCamera) {
    if (!this.enabled) return;
    // WebGLRenderer enables reversed-Z on a camera's first draw. Do not restore the
    // pre-first-draw forward projection after that capability transition.
    if (camera.reversedDepth !== this.projectionReversed) camera.updateProjectionMatrix();
    else { camera.projectionMatrix.copy(this.projection);camera.projectionMatrixInverse.copy(this.projection).invert(); }
  }
  render(r: T.WebGLRenderer, scene: T.Scene, camera: T.PerspectiveCamera, src: T.WebGLRenderTarget, depth: T.Texture): T.WebGLRenderTarget {
    if (!this.enabled) return src;
    this.vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    if (!this.valid) { this.prevVP.copy(this.vp);this.prevCamera.copy(camera.matrixWorldInverse); }
    this.pending.length = 0;
    const override = scene.overrideMaterial, background = scene.background, shadowUpdate = r.shadowMap.autoUpdate;
    scene.overrideMaterial = this.motion;scene.background = null;r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.velocity);
    const clearAlpha=r.getClearAlpha();r.setClearAlpha(0);
    r.render(scene, camera);
    r.setClearAlpha(clearAlpha);scene.overrideMaterial=override;scene.background=background;r.shadowMap.autoUpdate=shadowUpdate;
    const next = 1 - this.index, a=this.ambient.uniforms, u=this.resolve.uniforms;
    a.tDepth.value=u.tDepth.value=depth;a.invProj.value.copy(camera.projectionMatrixInverse);u.invProj.value.copy(camera.projectionMatrixInverse);
    a.valid.value=u.valid.value=this.valid?1:0;a.frame.value=this.frame%8;
    a.tHistory.value=this.aoHistory[this.index].texture;
    this.quad.material=this.ambient;r.setRenderTarget(this.aoHistory[next]);this.quad.render(r);
    u.tColor.value=src.texture;u.tHistory.value=this.colorHistory[this.index].texture;u.tAO.value=this.aoHistory[next].texture;u.aoStrength.value=this.ao;u.camWorld.value.copy(camera.matrixWorld);
    this.quad.material=this.resolve;r.setRenderTarget(this.colorHistory[next]);this.quad.render(r);
    this.prevVP.copy(this.vp);this.prevCamera.copy(camera.matrixWorldInverse);
    for (const record of this.pending) { record.previous.copy(record.current); record.last = this.frame; }
    this.valid=true;this.frame++;this.index=next;
    return this.colorHistory[next];
  }
}
