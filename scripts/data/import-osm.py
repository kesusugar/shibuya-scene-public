"""Convert OSM 0.6 XML to Overpass-compatible objects; preserve relation membership."""
import sys,json,xml.etree.ElementTree as ET
root=ET.parse(sys.argv[1]).getroot();elements=[]
for e in root:
 if e.tag not in ('node','way','relation'):continue
 d={'type':e.tag,'id':int(e.attrib['id']),'tags':{t.attrib['k']:t.attrib['v'] for t in e.findall('tag')}}
 if e.tag=='node':d.update(lat=float(e.attrib['lat']),lon=float(e.attrib['lon']))
 elif e.tag=='way':d['nodes']=[int(n.attrib['ref']) for n in e.findall('nd')]
 else:d['members']=[{'type':m.attrib['type'],'ref':int(m.attrib['ref']),'role':m.attrib['role']} for m in e.findall('member')]
 elements.append(d)
json.dump({'version':0.6,'generator':root.attrib.get('generator'),'elements':elements},open(sys.argv[2],'w'))
print('OSM objects',len(elements))
