"""CPU footprint and mass inspection; not WebGL rendering. Run verify-heroes first."""
import json, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon,Patch
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
h=json.load(open('evidence/s4/hero-metadata.json'));g=json.load(open('/tmp/s4-ground.json'));b=json.load(open('/tmp/s4-generic.json'));a=json.load(open('evidence/s4/reservation-audit.json'))
fig,ax=plt.subplots(figsize=(11,11));ax.set_facecolor('#e1e3dc')
for key,color in [('sidewalks','#b9bbae'),('roads','#626c73')]:
 for p in g[key]:ax.add_patch(Polygon(p[0],facecolor=color))
for c in g['crossings']:
 for s in c['stripes']:
  for p in s['polygon']:ax.add_patch(Polygon(p[0],facecolor='white'))
for x in b['buildings']:ax.add_patch(Polygon(x['polygon']['outer'],facecolor='#aab3bb',edgecolor='#79838b',linewidth=.3))
ids={x['id'] for x in a if x['phase']=='S5'}
for x in b['reserved']:
 if x['id'] in ids:ax.add_patch(Polygon(x['polygon']['outer'],fill=False,edgecolor='#da6378',hatch='///'))
for i,x in enumerate(h):
 ax.add_patch(Polygon(x['footprint']['outer'],facecolor=plt.cm.tab10(i),alpha=.85));p=x['centroid'];ax.text(*p,x['key'],fontsize=8,ha='center',bbox=dict(facecolor='white',alpha=.8,pad=1))
 f=x['primaryFacade'];ax.arrow(*f['mid'],f['normal'][0]*12,f['normal'][1]*12,width=.8,color='black')
ax.set(xlim=(-260,260),ylim=(260,-260),aspect='equal',xlabel='X east / m',ylabel='Z south / m',title='S4 CPU plan: Ground + generic + 9 Hero footprints\nHatched pink: 5 S5 reservations remain empty; arrows: primary facade')
fig.tight_layout();fig.savefig('evidence/s4/ground-heroes-plan.png',dpi=140);plt.close(fig)
fig=plt.figure(figsize=(15,14))
colors={'concreteLight':'#c3c6c6','concreteDark':'#5a6064','glass':'#688595','glassDark':'#293d4b','metal':'#a6afb5'}
for i,x in enumerate(h):
 ax=fig.add_subplot(3,3,i+1,projection='3d');faces=[];cs=[]
 for m in x['masses']:
  r=m['polygon']['outer'];lo=m['bottom'];hi=m['top'];faces.append([(p[0],p[1],hi) for p in r]);cs.append('#929b9e')
  for j,p in enumerate(r):
   q=r[(j+1)%len(r)];faces.append([(p[0],p[1],lo),(q[0],q[1],lo),(q[0],q[1],hi),(p[0],p[1],hi)]);cs.append(colors[m['material']])
 ax.add_collection3d(Poly3DCollection(faces,facecolors=cs,edgecolors='#46525a',linewidths=.25));bb=x['bounds'];ax.set_xlim(bb['minX'],bb['maxX']);ax.set_ylim(bb['minZ'],bb['maxZ']);ax.set_zlim(0,x['height']+3);ax.set_box_aspect((bb['maxX']-bb['minX'],bb['maxZ']-bb['minZ'],x['height']));ax.set_proj_type('ortho');ax.view_init(24,65);ax.set_title(x['key']+' / '+str(x['height'])+' m',fontsize=10);ax.set_axis_off()
fig.suptitle('S4 CPU mass silhouettes / independent scales\nMasses only: windows, frames and mechanical instances omitted; not WebGL validation');fig.tight_layout(rect=[0,0,1,.95]);fig.savefig('evidence/s4/hero-mass-silhouettes.png',dpi=140)
