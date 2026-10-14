# Far-terrain map data: sources and licences

The files in this folder (`t<i>_<j>.bin`, `overview.bin`) are derived data built by
`tools/terrain/build_terrain.mjs` from the public, no-login sources below (downloaded by
`tools/terrain/fetch_raw.mjs`; raw downloads are not part of the repository). They hold coarse
distance fields, land-cover shares and relief slopes only, at 125-500 m resolution.

| Source | Used for | Licence / terms | Link |
|---|---|---|---|
| ESA WorldCover 10 m 2021 v200 (read from the COGs' 4500 px overview level) | coastline and inland water, woods, meadows, heath, built-up areas | CC BY 4.0. © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium | https://esa-worldcover.org, `s3://esa-worldcover` (AWS Open Data) |
| Natural Earth 10m: land, minor islands, lakes, lakes Europe, rivers + lake centerlines, rivers Europe, railroads | coastline where WorldCover has no data, lakes, river courses, railway lines | Public domain | https://www.naturalearthdata.com, GeoJSON from https://github.com/nvkelso/natural-earth-vector |
| GeoNames `cities5000` | town positions and sizes | CC BY 4.0, © GeoNames | https://www.geonames.org, https://download.geonames.org/export/dump/ |
| Terrain Tiles (Terrarium encoding, zoom 9) on AWS Open Data | elevation: relief shading, lowland (polder) areas, shallow water | Open data with attribution; sources in Europe include SRTM (public domain), EU-DEM (produced using Copernicus data and information funded by the European Union), GMTED2010 and ETOPO1 (public domain). Attribution: "Terrain Tiles, Mapzen and contributors" | https://registry.opendata.aws/terrain-tiles/, https://github.com/tilezen/joerd/blob/master/docs/attribution.md |

Historical edits made by the builder: the Flevoland polders (drained 1957-68) are open water, as
in 1943. Town sizes are scaled down from modern populations toward their 1940s extent.

The in-game Credits screen names these sources (`credits.p5`).
