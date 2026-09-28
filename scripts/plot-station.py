"""CPU plan/elevation from emitted station geometry. Not a WebGL screenshot."""
import json,matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
m=json.load(open('evidence/s5/station-model.json'));g=json.load(open('/tmp/s5-ground.json'));b=json.load(open('/tmp/s5-generic.json'));heroes=json.load(open('evidence/s4/hero-metadata.json'))
fig,axs=plt.subplots(1,2,figsize=(17,11))
for ax,limits in zip(axs,[(-260,260,-260,260),(-55,150,-25,200)]):
 ax.set_facecolor('#e8e7de')
 for key,color in [('sidewalks','#d0ceba'),('roads','#7c8286')]:
  for p in g[key]:ax.add_patch(Polygon(p[0],facecolor=color))
 for x in b['buildings']:ax.add_patch(Polygon(x['polygon']['outer'],facecolor='#b7bdc3',edgecolor='#777e86',lw=.3))
 for x in heroes:ax.add_patch(Polygon(x['footprint']['outer'],facecolor='#9d8bac',alpha=.7))
 for c in g['crossings']:
  for s in c['stripes']:
   for p in s['polygon']:ax.add_patch(Polygon(p[0],facecolor='white'))
 for x in m['masses']:
  color={'jr-deck':'#277d82','ginza-deck':'#efa232','platform-slab':'#ede593','pedestrian-deck':'#6da5da','pedestrian-step':'#3489ba','hachiko-canopy':'#32945d'}.get(x['role'])
  if color:ax.add_patch(Polygon(x['polygon']['outer'],facecolor=color,alpha=.8,edgecolor=color,lw=.4))
 for a in m['alignments']:ax.plot(*zip(*a['points']),color='#133f44' if a['family']=='JR' else '#c36310',lw=1)
 for s in m['supports']:ax.plot(*s['point'],'o',ms=2.5,color='#1c3c4c')
 for s in m['supportRejected']:ax.plot(*s['point'],'x',ms=4,color='#ce4444')
 ax.text(*m['hachiko']['point'],'Hachiko Exit',fontsize=9,color='#113b23',ha='right',bbox=dict(facecolor='white',alpha=.9,pad=2))
 for d in m['pedestrians']:
  if d['stair']:ax.text(*d['line'][-1],'Stairs to ground',fontsize=8)
 ax.set(xlim=limits[:2],ylim=(limits[3],limits[2]),aspect='equal',xlabel='X east / m',ylabel='Z south / m')
axs[0].set_title('S5 CPU scene overlay / JR teal, Ginza orange, pedestrian blue');axs[1].set_title('Hachiko / station core alignment\nDots: placed supports; red x: rejected collision candidates')
fig.tight_layout();fig.savefig('evidence/s5/station-plan.png',dpi=135);plt.close(fig)
fig,ax=plt.subplots(figsize=(15,6))
for x in m['masses']:
 if x['role'] in ['jr-deck','ginza-deck','jr-girder','ginza-girder','platform-slab','platform-roof','hachiko-canopy','hachiko-base','pedestrian-deck','pedestrian-step']:
  z=[p[1] for p in x['polygon']['outer']];color={'jr-deck':'#277d82','ginza-deck':'#ed9829','platform-slab':'#c4ad48','platform-roof':'#6d7b85','hachiko-canopy':'#32945d','pedestrian-deck':'#6da5da','pedestrian-step':'#3489ba'}.get(x['role'],'#888888');ax.add_patch(Polygon([[min(z),x['bottom']],[max(z),x['bottom']],[max(z),x['top']],[min(z),x['top']]],facecolor=color,alpha=.65))
for s in m['supports']:ax.plot([s['point'][1]]*2,[s['base'],s['top']],color='#30495c',lw=.7)
ax.axhline(0,color='#5f664e');ax.set(xlim=(-250,250),ylim=(-1,23),xlabel='Z south / m (all X collapsed)',ylabel='Y up / m',title='S5 CPU side elevation / projected mass ranges\nJR deck 6.5 m; Ginza deck 14 m; pedestrian deck 6.2 m; Hachiko canopy 4.75 m');fig.tight_layout();fig.savefig('evidence/s5/station-elevation.png',dpi=140)
