import * as T from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { softDepth } from './SoftDepth';

export const shaftResolution = { value: new T.Vector2(1, 1) };

/** Low-frequency cabin volumes at half resolution, with depth-aware upsampling.
 * Aircraft, crew, glass and the rest of the transparent pass retain native pixels. */
export class InteriorLight {
  private target = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, depthBuffer: false });
  private clear = new T.Color();
  private material = new T.ShaderMaterial({
    uniforms: { tLight: { value: this.target.texture }, tDepth: softDepth.uniforms.tSoftDepth, texel: shaftResolution },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: /* glsl */ `
      varying vec2 vUv; uniform sampler2D tLight,tDepth; uniform vec2 texel;
      void main(){
        float depth=texture2D(tDepth,vUv).r;vec3 light=vec3(0.);float sum=0.;
        vec2 grid=vUv/texel-.5,base=(floor(grid)+.5)*texel,f=fract(grid);
        for(int i=0;i<4;i++){
          vec2 corner=vec2(float(i%2),float(i/2)),uv=base+corner*texel;
          vec2 bilinear=mix(1.-f,f,corner);
          float w=bilinear.x*bilinear.y/(1.+abs(texture2D(tDepth,uv).r-depth)*80.);
          light+=texture2D(tLight,uv).rgb*w;sum+=w;
        }
        gl_FragColor=vec4(light/max(sum,.00001),1.);
      }`,
    transparent: true, blending: T.AdditiveBlending, depthTest: false, depthWrite: false,
  });
  private quad = new FullScreenQuad(this.material);
  setSize(w: number, h: number) {
    w = Math.max(1, Math.ceil(w / 2)); h = Math.max(1, Math.ceil(h / 2));
    this.target.setSize(w, h); shaftResolution.value.set(1 / w, 1 / h);
  }
  render(renderer: T.WebGLRenderer, scene: T.Scene, camera: T.Camera) {
    const target=renderer.getRenderTarget(), layers=camera.layers.mask, auto=renderer.autoClear;
    const shadows=renderer.shadowMap.autoUpdate, alpha=renderer.getClearAlpha();
    renderer.getClearColor(this.clear);
    try {
      renderer.shadowMap.autoUpdate=false;renderer.autoClear=true;renderer.setClearColor(0,0);
      camera.layers.set(2);renderer.setRenderTarget(this.target);renderer.render(scene,camera);
      renderer.autoClear=false;renderer.setRenderTarget(target);this.quad.render(renderer);
    } finally {
      camera.layers.mask=layers;renderer.setClearColor(this.clear,alpha);
      renderer.autoClear=auto;renderer.shadowMap.autoUpdate=shadows;renderer.setRenderTarget(target);
    }
  }
}
