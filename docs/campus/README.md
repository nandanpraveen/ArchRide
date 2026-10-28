# UGA campus location catalog

The campus importer supplies real building reference points and a conservative subset of mapped automatic-door points for public search. It reads UGA's published GIS data; it does not derive entrances from bus stops, geocode addresses, guess coordinates, or assert accessible walking routes.

## Reviewed public sources

The [Office of University Architects homepage](https://www.architects.uga.edu/) links its [UGA Campus application](https://usg.maps.arcgis.com/apps/webappviewer/index.html?id=10832e7927124404a7119df52872af84). That application's public configuration identifies [webmap `02b6c7cef78a49e3b417dd8c310e672e`](https://www.arcgis.com/sharing/rest/content/items/02b6c7cef78a49e3b417dd8c310e672e/data?f=pjson), whose operational layers reference both sources below.

| Source | Fields used | Meaning |
| --- | --- | --- |
| [UGA Buildings, layer 7](https://maps.itos.uga.edu/arcgis/rest/services/OUA/UGA_CampusMap_Base/MapServer/7) | GlobalID, NAME, NUMBER, ADDRESS, SUBTYPE, X_DD, Y_DD, LASTUPDATE | Published building reference coordinates, not door coordinates. SUBTYPE 1 is the existing-building category in the source renderer. |
| [Automatic Doors, layer 1](https://maps.itos.uga.edu/arcgis/rest/services/OUA/UGA_CampusMap_Base/MapServer/1) | GlobalID, BUILDING, point geometry, LASTUPDATE | Source-mapped automatic-door locations. BUILDING links to a building NUMBER only when that number is globally unique in the fetched source. |
| [UGA Property, layer 0](https://services2.arcgis.com/PYn6bWCjT6bhw1z3/arcgis/rest/services/UGA_Property/FeatureServer/0) | FID, NAME, GlobalID, LASTUPDATE, polygon geometry | Full published property polygons in WGS84, used to select the Home catalog's supported campus areas. |

The service is also independently published as the public [UGA Campus Map Base Data Service item](https://www.arcgis.com/sharing/rest/content/items/73ddcfa0d3ab467cbc26b65a95a507aa?f=pjson). It and the [UGA Property item](https://www.arcgis.com/sharing/rest/content/items/79cd581d037142968b5d86d965430764?f=pjson) are owned by the official UGA GIS coordinator's university account, `Adam.Ghafourian@uga.edu`. The checked-in evidence records the actual source metadata, request hashes and extraction time.

## Scope and coordinate limits

The selected property NAME values are **Main Campus**, **Health Sciences Campus**, **Chicopee Complex**, **Riverbend Research Park**, **River's Crossing**, and **School of Social Work**. This explicit app scope excludes other named properties, including statewide farms and research sites. Point-in-polygon checks preserve all source rings, holes, disjoint parts and boundary points; no bounding box is labeled official. The complete selected source polygons are retained in `evidence/selected-properties.json` without simplification.

This selected set is not a comprehensive Athens building inventory or the final Week 3 parking/map boundary. Some university-associated facilities outside these named properties will not appear. Broadening the scope requires reviewing additional named source polygons and rerunning the importer.

Stable IDs namespace source GlobalIDs as `uga-oua:building:<uuid>` and `uga-oua:entrance:<uuid>`. Empty names, noncurrent categories, invalid coordinates and points outside the selected source polygons are skipped with explicit counts. Addresses and building numbers become literal search aliases. A small source-cited alias list also supports MLC, SLC and Boyd's expanded name. Alias overrides require the exact expected source identity and name; an upstream rename disables them pending review.

| Added common names | Primary naming evidence |
| --- | --- |
| MLC; Miller Learning Center | [UGA Libraries Teaching & Learning](https://libraries.uga.edu/mlc/teaching-learning) uses the acronym and gives Building 0081 / 48 Baxter Street, matching the GIS building. |
| SLC | [UGA University Transitions glossary](https://transitions.uga.edu/transition-guide/get-started/) identifies SLC as the Science Learning Center. The historical Student Learning Center name is not added as an SLC alias for the Miller building. |
| Boyd Research and Education Center; George Hugh Boyd Research and Education Center; Boyd Center | [UGA Brand Style Guide](https://brand.uga.edu/writing-style/styleguide/george_hugh_boyd_research_and_education_center/) supplies the formal, first-reference and second-reference names. |

An entrance is imported only when its BUILDING number matches exactly one building across the full fetched catalog and that parent building is included. Ambiguous, blank and unmatched parent numbers are skipped. Door points are not snapped to nearby buildings. Their `accessible` field stays null: the source layer identifies automatic doors, but does not establish current operation, public access, opening hours, step-free paths, or a complete entrance inventory. Source timestamps are retained inside provenance; many door records do not supply one. `verified_at` records source extraction/review time, not an onsite survey or a guarantee that the underlying source was updated then.

## Reuse and attribution

The UGA [Campus Mapping Project](https://www.architects.uga.edu/maps) describes sharing core GIS data for users to create their own maps. At review, both public ArcGIS service items had no special terms or credit restrictions in `licenseInfo`/`accessInformation`. Esri's [item terms guidance](https://doc.arcgis.com/en/arcgis-online/reference/access-use-constraints.htm) describes typical personal/noncommercial use and says absent item terms indicate no special restrictions. An attributed, noncommercial student import is a reasonable inference from this evidence. No Creative Commons/public-domain license, university endorsement, paid use permission or unlimited request quota is asserted.

Display: **Campus location data: University of Georgia Office of University Architects (UGA GIS).** Preserve source links and the student-built/noncommercial affiliation statement. Keep transit's UGA/Passio attribution separate. The importer fails for review if the item owner, source URL, public visibility or special terms change.

No numeric rate limit, refresh interval or SLA is published in the inspected metadata. The command performs bounded, paginated reads only when explicitly invoked by an operator; it creates no timer, scheduled importer or browser-to-provider polling. Reads have a 15-second request timeout, at most three attempts, an 8 MB response bound, a 10,000-record source cap, and 500-record pages. HTTP 429/provider cooldown handling is inherited from the existing bounded fetch helper. Recheck source terms before a future refresh; avoid unnecessary repeated downloads.

## Generate and review an import

```sh
node --import tsx scripts/campus/import.ts --fetch --output /tmp/archride-campus-review-NEW
```

Use a new output directory. The command writes `catalog.json`, `catalog.sql`, `source-evidence.json`, and `selected-properties.json`; it never connects to a database. Review the report, skipped reasons, source metadata and representative named locations before a maintainer applies SQL to the linked ArchRide project.

The SQL transaction takes an advisory lock, rejects a catalog older than the already-applied `uga-campus:catalog` record, upserts only its source IDs, and records catalog health separately from transit freshness. It changes no schema, grants, RLS, Auth records or other sources. Applying the same artifact twice is idempotent. Missing source rows are not automatically deleted; review removals explicitly before a later refresh. The application should read the shared Supabase catalog, preserve typed building/entrance/stop identities, and label catalog freshness separately from live transit.

```sh
node --import tsx --test tests/transit/campus-catalog.test.ts
```

Tests cover polygon boundaries/holes, invalid/outside/unnamed/noncurrent records, ambiguous parent joins, identity-based aliases, bounded pagination and metadata changes, SQL quotation, transaction replay, stale artifact rejection, guest reads and denied guest deletion.
