# Rebuild reviewed parking inventory and geographic bounds from checked-in factual source snapshots.
# Tooling: Python 3, shapely==2.2.0, pyproj==3.8.0 (no application dependency).
import json,math,re,datetime
from pathlib import Path
from collections import defaultdict
from shapely.geometry import Polygon,Point,mapping,shape
from shapely.ops import unary_union,transform
from pyproj import Transformer
root=Path(__file__).resolve().parents[2]
source_dir=root/'docs/parking/sources'
rows=json.load(open(source_dir/'enforcement-rows.json'))
polygons=json.load(open(source_dir/'parking-polygons.json'))['features']
properties=json.load(open(source_dir/'campus-properties.json'))['features']
bycode=defaultdict(list)
for r in polygons:
 if r.get('geometry',{}).get('rings'):
  p=Polygon(r['geometry']['rings'][0]).buffer(0)
  if not p.is_empty:bycode[str(r['attributes']['PKLOT_CODE']).strip()].append((r,p))
tables={r[0]:r for r in rows if len(r)==5 and r[0]!='Lot #'}
# PDF labels supersede older polygon-code attributes for these subdivisions.
overrides={'N13':[1319],'N14':[23773],'TSL':[7271],'E16':[641]}
names={'N14':'East Campus Road / Reed Hall','E16':'East Village surface lot','W18':'West Campus Deck 2','HSCVIS':'Health Sciences visitor parking','HSCPPD':'Health Sciences facilities parking','VMCVIS':'Veterinary Medical Center visitor parking','S27':'University Village parking (GIS S27)'}
for c,n in names.items():tables.setdefault(c,[c,n,'Unknown','Unknown',''])
# Current map uses W03 where the legacy GIS still uses W01.
bycode['W03']=bycode['W01']
for c,ids in overrides.items():bycode[c]=[(r,p)for rr in bycode.values()for r,p in rr if r['attributes']['OBJECTID']in ids]
bycode['N03']=[x for x in bycode['N03']if x[0]['attributes']['OBJECTID']!=1319]
bycode['N11']=[x for x in bycode['N11']if x[0]['attributes']['OBJECTID']!=7271]
bycode['E06']=[x for x in bycode['E06']if x[0]['attributes']['OBJECTID']!=641]
source='https://tps.uga.edu/parking/enforcement/'
gis='https://maps.itos.uga.edu/arcgis/rest/services/OUA/UGA_CampusMap_Base/MapServer/8'
mapurl='https://tps.uga.edu/navigating-campus/maps/permit-parking/'
rules='https://tps.uga.edu/wp-content/uploads/Parking-Rules-Regulations-Updated-8.6.2025-revised.pdf'
conflicts={'S18','S19','S20','S22','S23','S24'}
weekconflicts={'N02','N03','N04','N05','N13','W16','W17','E04','E20','N11','S11','S15','W05','N06'}
lots=[];unmapped=[];selected_shapes=[]
for code,row in sorted(tables.items()):
 candidates=bycode.get(code,[])
 if not candidates:unmapped.append(code);continue
 # Interior point of the largest published lot component, not a center in a road/building.
 r,p=max(candidates,key=lambda x:x[1].area)
 point=p.representative_point()
 if not(-83.5<point.x<-83.25 and 33.85<point.y<34.05):raise Exception(code)
 selected_shapes.extend(p for _,p in candidates)
 cat=lambda s:'permit'if s.startswith('Permit')else'registered'if s=='Registered Vehicles'else'any'if s=='Any Vehicle'else'unknown'
 evening='unknown'if code in conflicts else cat(row[3])
 weekend='unknown'if code in weekconflicts or code in names or code=='E24'else'any'
 note=[]
 if code in conflicts:note.append('TPS enforcement table and published housing rules disagree after 5 PM. Check posted signs and TPS before parking.')
 if code in weekconflicts:note.append('Official weekend/after-hours sources differ. Weekend permission and payment hours need confirmation with TPS.')
 if code in names:note.append('Published location confirmed; no matching ordinary enforcement row. Access conditions are unknown.')
 if code in overrides or code=='W03':note.append('Current TPS map label reconciled to the published OUA polygon; the older GIS code differs.')
 if code=='E24':note.append('Weekday gate opens 6 AM and closes 7 PM. Do not enter after gate closure; weekend access is unverified.')
 if code in ['N06','S11']:note.append('After-hours deck entry may require a UGA OneCard at the gate. Check the current after-hours map.')
 if code=='TSL':note.append('Weekday permit enforcement begins at 4 AM. Gameday relocation may begin Thursday at 5:15 PM.')
 lot={'id':code.lower(),'code':code,'name':row[1],'type':'deck'if 'deck'in row[1].lower()else'lot','longitude':round(point.x,7),'latitude':round(point.y,7),'weekday':cat(row[2]),'evening':evening,'weekend':weekend,'paid':('Pay-per-hour offered; '+row[4].replace('✔️','').strip())if row[4]else ('Daily paid visitor parking via ParkMobile; see TPS for hours and current fees.'if code in {'E23','E25','E26','S26'}else'No paid visitor option confirmed for this location.'),'notes':note,'sourceObjectId':r['attributes']['OBJECTID'],'sources':[source,mapurl,gis, 'https://tps.uga.edu/parking/visitors/']+([rules]if code in conflicts|weekconflicts else[]),'verifiedAt':'2026-11-03'}
 lots.append(lot)
if unmapped:raise Exception('Unmapped:'+','.join(unmapped))
(root/'src/lib/parking-data.json').write_text(json.dumps(lots,indent=2)+'\n')
# Meter-based local azimuthal equidistant projection centered on UGA Athens.
crs='+proj=aeqd +lat_0=33.945 +lon_0=-83.375 +datum=WGS84 +units=m +no_defs'
fwd=Transformer.from_crs('EPSG:4326',crs,always_xy=True).transform
rev=Transformer.from_crs(crs,'EPSG:4326',always_xy=True).transform
names={'Main Campus','Health Sciences Campus','Chicopee Complex','Riverbend Research Park',"River's Crossing",'School of Social Work','Lucy Cobb','Riverbend Farm','Campus Transit','Club Sports','Jack Turner Family Complex','Hodgson Oil Property','382 E BROAD ST'}
selected=[]
for r in properties:
 if r['attributes']['NAME']not in names:continue
 for ring in r.get('geometry',{}).get('rings',[]):
  p=Polygon(ring).buffer(0)
  if p.is_empty:continue
  if -83.5<p.centroid.x<-83.25 and 33.85<p.centroid.y<34.05:selected.append(p)
footprint=unary_union([transform(fwd,p)for p in selected+selected_shapes]).buffer(0)
# 256 segments per quadrant: arc chord underfill <0.023 m at 4,828.032 m.
buffered=footprint.buffer(4828.032,quad_segs=256).simplify(0.05,preserve_topology=True)
if buffered.geom_type!='Polygon':raise Exception(buffered.geom_type)
ring=[[round(x,8),round(y,8)]for x,y in transform(rev,buffered).exterior.coords]
metadata={'bufferMeters':4828.032,'projection':crs,'verifiedAt':'2026-11-03','footprintSource':'https://services2.arcgis.com/PYn6bWCjT6bhw1z3/arcgis/rest/services/UGA_Property/FeatureServer/0','parkingGeometrySource':gis,'bounds':list(transform(rev,buffered).bounds),'ring':ring}
(root/'src/lib/campus-boundary.json').write_text(json.dumps(metadata,separators=(',',':'))+'\n')
geo={'type':'Feature','properties':{k:v for k,v in metadata.items()if k not in ['ring','bounds']},'geometry':mapping(transform(rev,footprint.simplify(0.5,preserve_topology=True)))}
(root/'docs/parking/campus-footprint.geojson').write_text(json.dumps(geo,separators=(',',':'))+'\n')
audit={'verifiedAt':'2026-11-03','lotCount':len(lots),'enforcementCodes':sorted({r[0]for r in rows if len(r)==5 and r[0]!='Lot #'}),'additionalMapOrGisCodes':sorted({'N14','E16','W18','HSCVIS','HSCPPD','VMCVIS','S27'}),'duplicateEnforcementRows':['S01 (north/south tables)'],'legacyAliases':{'W01':'W03','Tate Center Deck':'N11','STEM Parking Deck':'S06','Vet Med Center Parking':'VMC','University Parking':'S24'},'sourcePinCount':len(json.load(open(root/'docs/parking-source-pins.json'))),'excludedSourcePins':[{'name':'Dooley Plaza Visitor Spaces','reason':'Individual designated visitor spaces, not a separate TPS lot/deck; special-space rules apply.'}],'polygonSubdivisionOverrides':overrides,'unmappedCodes':unmapped,'boundaryVertices':len(ring),'footprintComponentCount':len(footprint.geoms)if hasattr(footprint,'geoms')else 1}
(root/'docs/parking/inventory-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
print('lots',len(lots),'boundary vertices',len(ring),'data bytes',(root/'src/lib/parking-data.json').stat().st_size)
