"""CPU placement audit map only; not a WebGL visual PASS."""
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
from matplotlib.lines import Line2D
from pathlib import Path

data=json.loads(Path('evidence/s7/cpu-map-input.json').read_text())
colors={'centerGai':'#c592ff','frontage':'#ff7089','scramble':'#64dcff','dogenzaka':'#ffbd66','station':'#73dfaf','secondary':'#adc6d2','peripheral':'#79828e'}
fig,axs=plt.subplots(1,2,figsize=(15,8),facecolor='#101923')
for ax,title,extent in zip(axs,['S7 HIGH / placement audit','Center-gai / commercial facade anchors'],[(-250,250,-250,250),(-190,35,-140,40)]):
 ax.set_facecolor('#101923')
 for p in data['roads']:
  ax.add_patch(Polygon(p[0],facecolor='#3b444e',edgecolor='none'))
 for b in data['buildings']:
  ax.add_patch(Polygon(b['polygon']['outer'],facecolor='#202e3a',edgecolor='#64717c',linewidth=.4))
 for h in data['heroes']:
  ax.add_patch(Polygon(h['footprint']['outer'],facecolor='#334457',edgecolor='#f1d680',linewidth=.8))
 for s in data['signs']:
  x,y,z=s['position'];nx,_,nz=s['normal'];w=s['width']/2
  ax.plot([x-nz*w,x+nz*w],[z+nx*w,z-nx*w],color=colors[s['region']],linewidth=1.1)
 for s in data['rejected']:
  ax.plot(s['position'][0],s['position'][2],marker='x',color='#ed5b59',markersize=2,alpha=.35)
 ax.set_xlim(extent[:2]);ax.set_ylim(extent[3],extent[2]);ax.set_aspect('equal');ax.set_title(title,color='white');ax.tick_params(colors='#aab9c7');ax.set_xlabel('X east / metres',color='#aab9c7');ax.set_ylabel('Z south / metres',color='#aab9c7')
fig.legend(handles=[Line2D([0],[0],color=c,label=k,linewidth=3) for k,c in colors.items()],loc='lower center',ncol=7,facecolor='#101923',labelcolor='white')
fig.suptitle('CPU map / not a rendered scene — red crosses: rejected candidates',color='white')
fig.tight_layout(rect=[0,.05,1,.95]);fig.savefig('evidence/s7/signage-density-cpu.png',dpi=140,facecolor=fig.get_facecolor());plt.close(fig)
