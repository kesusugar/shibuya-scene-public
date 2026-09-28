"""CPU density/debug drawings and CAM-05 proxy projection; not WebGL validation."""
import json,math,matplotlib,numpy as np
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
m=json.load(open('evidence/s6/detail-model.json'));g=json.load(open('/tmp/s6-ground.json'));c=json.load(open('/tmp/s6-core.json'));generic=json.load(open('evidence/s3/building-metadata.json'));heroes=json.load(open('evidence/s4/hero-metadata.json'))
fig,axes=plt.subplots(2,2,figsize=(17,16))
for ax,lim,title in zip(axes.flat,[(-70,245,-20,220),(-55,65,5,190),(52,145,45,205),(40,190,-250,250)],['S6 station overlay / density','Rotary / plaza edge / Hachiko','Gadoshita + platform fixtures','JR catenary / signals']):
 ax.set_facecolor('#eae9df')
 for key,color in [('sidewalks','#cdcbb8'),('roads','#7b858c')]:
  for p in g[key]:ax.add_patch(Polygon(p[0],facecolor=color))
 for x in generic['buildings']:ax.add_patch(Polygon(x['polygon']['outer'],facecolor='#c3c8c9',edgecolor='#9a9fa5',lw=.25))
 for h in heroes:ax.add_patch(Polygon(h['footprint']['outer'],facecolor='#a89bb8'))
 for s in c['masses']:
  if s['role'] in ['jr-deck','ginza-deck','platform-slab','hachiko-canopy','pedestrian-deck']:ax.add_patch(Polygon(s['polygon']['outer'],facecolor='#c1cdcd',alpha=.6,edgecolor='#769398',lw=.3))
 for p in c['supports']:ax.plot(*p['point'],'.',color='#435561',ms=3)
 for f in m['fixtures']:
  color='#ba663b' if f['role']=='gadoshita' else '#298eaa' if f['platform'] else '#397955'
  ax.add_patch(Polygon(f['polygon']['outer'],facecolor=color,edgecolor=color,lw=.4))
 for s in m['signals']:ax.arrow(*s['point'],math.sin(s['heading'])*3,math.cos(s['heading'])*3,width=.22,color='#c33147')
 for w in m['wires']:
  if w['kind']=='contact-wire':ax.plot([w['from'][0],w['to'][0]],[w['from'][2],w['to'][2]],color='#d89823',lw=.6)
 for s in m['catenary']:ax.plot(*s['point'],'+',ms=4,color='#8a6422')
 for s in m['collisions']:ax.plot(*s['point'],'o',ms=8,fillstyle='none',color='#d54c4c')
 if title.startswith('Rotary'):
  for s in m['rotary']:ax.text(*s['point'],s['type'],fontsize=6,ha='left')
  ax.text(*c['hachiko']['point'],'HACHIKO EXIT',fontsize=8,ha='right',bbox=dict(facecolor='white',alpha=.8,pad=1))
 if title.startswith('Gadoshita'):
  for s in m['shops']:ax.text(*s['point'],s['type'],fontsize=7,ha='right')
 ax.set(xlim=lim[:2],ylim=(lim[3],lim[2]),aspect='equal',xlabel='X east / m',ylabel='Z south / m',title=title)
fig.suptitle('CPU inspection: teal platform fixtures / brown shops / green plaza props\nOrange JR contact wires; red arrows rail signals; red circles NEW minor sidewalk overlaps (S5 baseline remains 11)');fig.tight_layout(rect=[0,0,1,.95]);fig.savefig('evidence/s6/station-detail-density.png',dpi=145);plt.close(fig)
# Same eye/target/FOV as CAM-05. Painter-sorted geometry proxies only.
eye=np.array([-25,15,25.]);target=np.array([30,8,50.]);forward=target-eye;forward/=np.linalg.norm(forward);right=np.cross(forward,[0,1,0]);right/=np.linalg.norm(right);up=np.cross(right,forward);surfaces=[]
def poly(points,color):
 v=np.asarray(points)-eye;depth=v@forward
 if min(depth)<.5:return
 xy=np.column_stack((v@right/depth,v@up/depth))
 if (xy[:,0].min()>.9 or xy[:,0].max()<-.9 or xy[:,1].min()>.5 or xy[:,1].max()<-.5):return
 surfaces.append((float(depth.mean()),xy,color))
def extrude(p,lo,hi,color):
 r=p['outer'];poly([[x,hi,z] for x,z in r],color)
 for i,a in enumerate(r):
  b=r[(i+1)%len(r)];poly([[a[0],lo,a[1]],[b[0],lo,b[1]],[b[0],hi,b[1]],[a[0],hi,a[1]]],color)
for p in g['roads']:poly([[x,0,z] for x,z in p[0]],'#626e76')
for b in generic['buildings']:extrude(b['polygon'],.15,b['height']+.15,'#9ea6aa')
for h in heroes:
 for s in h['masses']:extrude(s['polygon'],s['bottom'],s['top'],'#8b99a3')
for s in c['masses']:
 color='#bfc6c5' if 'roof' in s['role'] or 'canopy' in s['role'] else '#47734f' if 'green-band' in s['role'] else '#9aa6a9'
 extrude(s['polygon'],s['bottom'],s['top'],color)
palette={'metal':'#6c7981','dark':'#26343c','cream':'#d9d9c9','wood':'#81634a','glass':'#637e8a','green':'#3b785a','yellow':'#e5bd43','glow':'#efc884'}
for r in m['instances']+[dict(r,material='core') for r in c['instances'] if r['role'] in ['pier','platform-post','platform-support','pedestrian-support','hachiko-column']]:
 corners=np.array([[x,y,z] for x in [-.5,.5] for y in [-.5,.5] for z in [-.5,.5]])*r['scale'];rx,ry,rz=r.get('rotation',[0,r.get('heading',0),0]);cx,sx,cy,sy,cz,sz=math.cos(rx),math.sin(rx),math.cos(ry),math.sin(ry),math.cos(rz),math.sin(rz);rot=np.array([[1,0,0],[0,cx,-sx],[0,sx,cx]])@np.array([[cy,0,sy],[0,1,0],[-sy,0,cy]])@np.array([[cz,-sz,0],[sz,cz,0],[0,0,1]]);q=corners@rot.T+r['position']
 for ids in [[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]]:poly(q[ids],palette.get(r['material'],'#9aa6a9'))
fig,ax=plt.subplots(figsize=(15,8.5));ax.set_facecolor('#dce3e5')
for _,xy,color in sorted(surfaces,key=lambda v:-v[0]):ax.add_patch(Polygon(xy,facecolor=color,edgecolor='#4e5a62',lw=.1))
fov=math.tan(math.radians(25));ax.set(xlim=(-fov*16/9,fov*16/9),ylim=(-fov,fov),aspect='equal',title='CAM-05 eye/target CPU proxy projection\nNo WebGL, textures, shadows or pixel-accurate occlusion; round fixtures shown as box proxies');ax.set_xticks([]);ax.set_yticks([]);fig.tight_layout();fig.savefig('evidence/s6/cam05-cpu-projection.png',dpi=145)
