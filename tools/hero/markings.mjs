// Dedicated stencil atlas: glyphs retain hundreds of texels independently of skin LOD.
import sharp from 'sharp';
import {mkdirSync} from 'node:fs';
mkdirSync('tools/hero/output',{recursive:true});
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="512">
<g fill="#e5e5cc" font-family="Arial, sans-serif">
<text x="0" y="226" font-size="260" transform="translate(40,0) scale(2.5,1)">GD</text>
<text x="0" y="472" font-size="220" transform="translate(32,0) scale(1.55,1)">23772</text>
</g></svg>`)).png().toFile('tools/hero/output/markings.png');
