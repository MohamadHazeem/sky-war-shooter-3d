# Aircraft paint scan reference

`painted_metal_shutter_diffuse.jpg` and `painted_metal_shutter_rough.jpg` are the 1K maps from
[Painted Metal Shutter](https://polyhaven.com/a/painted_metal_shutter), Poly Haven.
Photography: Charlotte Baglioni; baking: Dario Barresi; processing: Rico Cilliers.
[CC0 1.0](https://polyhaven.com/license). Downloaded 2026-10-15 from the no-login API:
https://api.polyhaven.com/files/painted_metal_shutter

Source map MD5: diffuse `b2b648a56ca737d51999525e857f499a`, roughness `b593747ca3057c79815e485be57e5ff7`.
The build removes row-average corrugation/shading, samples the residual scan in the aircraft
surface frame, and applies it at low amplitude to paint colour and roughness. No shutter
normal/displacement is applied to the airframe. This is a material reference, not historical aircraft paint data.
The source images are build inputs only; derivatives are baked into the existing shipped atlases.
