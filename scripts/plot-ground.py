"""CPU-only plan view from /tmp/s2-model.json; not a WebGL render."""
import json, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.path import Path
from matplotlib.patches import PathPatch
m=json.load(open('/tmp/s2-model.json'))
fig,axes=plt.subplots(1,2,figsize=(14,7),facecolor='#202830')
for ax,limit in zip(axes,[250,45]):
 ax.set_facecolor('#202830')
 def draw(multi,color):
  for poly in multi:
   verts=[]; codes=[]
   for ring in poly:
    verts+=ring; codes += [Path.MOVETO]+[Path.LINETO]*(len(ring)-2)+[Path.CLOSEPOLY]
   ax.add_patch(PathPatch(Path(verts,codes),facecolor=color,edgecolor='none'))
 draw(m['sidewalks'],'#aaa9a1'); draw(m['roads'],'#44484d')
 for c in m['crossings']:
  for s in c['stripes']: draw(s['polygon'],'#f8f3e5')
 for k in ['stopLines','guides','arrows']:
  for p in m[k]: draw(p,'#eeeeee')
 for p in m['tactiles']: draw(p,'#e4ba27')
 ax.set_xlim(-limit,limit); ax.set_ylim(limit,-limit); ax.set_aspect('equal'); ax.tick_params(colors='white'); ax.set_xlabel('X east (m)',color='white'); ax.set_ylabel('Z south (m)',color='white')
axes[0].set_title('CPU geometry plan / 500 m extent',color='white'); axes[1].set_title('Scramble / OSM coordinates',color='white'); fig.tight_layout(); fig.savefig('evidence/s2/ground-plan.png',dpi=140)
