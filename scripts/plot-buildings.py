"""CPU inspection map, not a WebGL screenshot. Run verify-buildings.mjs first."""
import json,matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.path import Path
from matplotlib.patches import PathPatch,Patch
b=json.load(open('evidence/s3/building-metadata.json'))
g=json.load(open('/tmp/s3-ground.json'))
colors={'plain':'#d0c3a2','shop':'#edb76f','band':'#83bbb3','grid':'#7ba5d7','balcony':'#a6c977','curtain':'#697dda','zakkyo':'#c895c9'}
fig,axes=plt.subplots(1,2,figsize=(15,8),facecolor='#202830')
for ax,limit in zip(axes,[250,85]):
 ax.set_facecolor('#202830')
 def draw(rings,color,edge='none',hatch=None):
  verts=[];codes=[]
  for r in rings:
   if r[0]!=r[-1]:r=r+[r[0]]
   verts+=r;codes += [Path.MOVETO]+[Path.LINETO]*(len(r)-2)+[Path.CLOSEPOLY]
  ax.add_patch(PathPatch(Path(verts,codes),facecolor=color,edgecolor=edge,lw=.5,hatch=hatch))
 for p in g['sidewalks']:draw(p,'#717772')
 for p in g['roads']:draw(p,'#3d464e')
 for c in g['crossings']:
  for stripe in c['stripes']:
   for p in stripe['polygon']:draw(p,'#e9e7df')
 for r in b['reserved']:draw([r['polygon']['outer']]+r['polygon']['holes'],'none','#ff6c81','///')
 for item in b['buildings']:draw([item['polygon']['outer']]+item['polygon']['holes'],colors[item['archetype']],'#202830')
 ax.set_xlim(-limit,limit);ax.set_ylim(limit,-limit);ax.set_aspect('equal');ax.tick_params(colors='white');ax.set_xlabel('X east / metres',color='white');ax.set_ylabel('Z south / metres',color='white')
axes[0].set_title('S3 / Ground + generic footprints',color='white');axes[1].set_title('Scramble / reserved heroes remain empty',color='white')
handles=[Patch(facecolor=v,label=k) for k,v in colors.items()]+[Patch(facecolor='none',edgecolor='#ff6c81',hatch='///',label='Reserved (not rendered)')]
fig.legend(handles=handles,loc='lower center',ncol=4,facecolor='#202830',labelcolor='white');fig.tight_layout(rect=[0,.085,1,1]);fig.savefig('evidence/s3/ground-buildings-plan.png',dpi=140)
