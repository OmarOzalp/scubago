"""Author the first three stylized species. Blender 5.2, no external textures.
Run: blender --background --factory-startup --python scripts/art/prepare-species.py
These are reviewable art drafts, not scientific reconstructions.
"""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/models/marine'
PREVIEW=ROOT/'docs/art-previews'
PREVIEW.mkdir(parents=True,exist_ok=True)
TAU=math.tau

def material():
    m=bpy.data.materials.new('Painted skin');m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Roughness'].default_value=.8
    c=m.node_tree.nodes.new('ShaderNodeVertexColor');c.layer_name='Color'
    m.node_tree.links.new(c.outputs['Color'],p.inputs['Base Color'])
    return m

def mesh(name,verts,faces,colors,weights,arm,mat):
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj)
    data.materials.append(mat)
    attr=data.color_attributes.new(name='Color',type='BYTE_COLOR',domain='CORNER')
    for p in data.polygons:
        p.use_smooth=True
        for li in p.loop_indices:attr.data[li].color=(*colors[data.loops[li].vertex_index][:3],1)
    groups={b.name:obj.vertex_groups.new(name=b.name) for b in arm.data.bones}
    for i,ws in enumerate(weights):
        for key,val in ws.items():
            if val>0:groups[key].add([i],val,'REPLACE')
    obj.parent=arm; mod=obj.modifiers.new('Swim skin','ARMATURE');mod.object=arm
    return obj

ANCHORS=[-5.5,-2.6,.5,3.1,4.7,6]
def weight(y):
    for i in range(len(ANCHORS)-1):
        if y<=ANCHORS[i+1]:
            t=max(0,min(1,(y-ANCHORS[i])/(ANCHORS[i+1]-ANCHORS[i])))
            return {f'Swim{i}':1-t,f'Swim{i+1}':t}
    return {'Swim5':1}

def rig():
    data=bpy.data.armatures.new('Shark skeleton');arm=bpy.data.objects.new('Shark rig',data);bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    prev=None
    for i,y in enumerate(ANCHORS):
        b=data.edit_bones.new(f'Swim{i}');b.head=(0,y,0);b.tail=(0,y+.6,0)
        if prev:b.parent=prev
        prev=b
    bpy.ops.object.mode_set(mode='POSE')
    for frame in range(0,49,4):
        for i,b in enumerate(arm.pose.bones):
            b.rotation_mode='XYZ';b.rotation_euler.z=math.sin(frame/48*TAU-i*.58)*[.012,.018,.045,.075,.10,.13][i]
            b.keyframe_insert(data_path='rotation_euler',frame=frame)
    bpy.ops.object.mode_set(mode='OBJECT');arm.animation_data.action.name='Swim'
    return arm

def shark(kind):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    arm=rig();mat=material();whale=kind=='whale-shark'
    # Longitudinal sections: y, half-width, half-height, vertical center.
    profile=([(-5.6,.95,.24,.06),(-5.35,1.22,.40,.05),(-4.8,1.33,.53,.02),(-3.8,1.30,.64,0),(-2.6,1.14,.68,0),(-1, .96,.66,0),(.6,.73,.53,0),(2,.49,.36,0),(3.4,.25,.23,0),(4.6,.14,.16,.02),(5,.13,.15,.03)] if whale else
             [(-5.5,.31,.15,.10),(-5.22,.70,.37,.05),(-4.6,.98,.58,.02),(-3.5,1.04,.73,0),(-2.2,.99,.76,0),(-.8,.77,.62,0),(.8,.56,.43,0),(2.2,.33,.28,0),(3.5,.16,.16,0),(4.7,.12,.12,.04),(5,.1,.12,.05)])
    def section(y):
        for i in range(len(profile)-1):
            a,b=profile[i:i+2]
            if y<=b[0]:
                t=max(0,min(1,(y-a[0])/(b[0]-a[0])))
                return tuple(a[j]*(1-t)+b[j]*t for j in (1,2,3))
        return profile[-1][1:]
    def surface(y,t,lift=0):
        w,h,z=section(y)
        return (math.sin(t)*(w+lift),y,z+math.cos(t)*(h+lift))
    top=(.075,.22,.265) if whale else (.30,.35,.32)
    belly=(.76,.79,.66) if whale else (.76,.76,.65)
    dark=(.035,.09,.095);cream=(.85,.87,.68)
    verts=[];colors=[];faces=[];weights=[]
    rows=37;cols=28
    for j in range(rows):
        y=profile[0][0]+(5-profile[0][0])*j/(rows-1)
        for k in range(cols):
            t=TAU*k/cols;verts.append(surface(y,t));weights.append(weight(y));colors.append(belly if math.cos(t)<-.36 else top)
    for j in range(rows-1):
        for k in range(cols):
            a=j*cols+k;b=j*cols+(k+1)%cols;faces.append((a,b,b+cols,a+cols))
    # Rounded terminal face; whale shark's wide mouth is drawn across its leading edge below.
    faces.extend([tuple(reversed(range(cols))),tuple((rows-1)*cols+k for k in range(cols))])
    body=mesh('Broad flattened whale shark' if whale else 'Stocky tiger shark',verts,faces,colors,weights,arm,mat)
    def patch(points,color,name='Skin markings',ribbon=False):
        n=len(points)
        faces=[(i,i+1,n-2-i,n-1-i) for i in range(n//2-1)] if ribbon else [tuple(range(n))]
        return mesh(name,points,faces,[color]*n,[weight(p[1]) for p in points],arm,mat)
    def disk(y,t,ry,rt,color):
        pts=[surface(y+math.cos(a)*ry,t+math.sin(a)*rt,.014) for a in [TAU*k/8 for k in range(8)]]
        patch(pts,color)
    if whale:
        # Offset rows of pale spots on the dorsal surface, following the body contours.
        for row in range(16):
            y=-4.95+row*.54
            for col in range(9):
                t=-1.64+col*.41+(row%2)*.075
                disk(y,t,.075 if row<11 else .055,.052,cream)
        # Three restrained longitudinal flank ridges/pale lines per side.
        for sign in (-1,1):
            for t in (1.05,1.33,1.60):
                for j in range(12):
                    y=-2.6+j*.5
                    patch([surface(y,sign*t,.025),surface(y+.48,sign*t,.025),surface(y+.48,sign*(t+.021),.025),surface(y,sign*(t+.021),.025)],(.30,.46,.43),'Flank ridge')
        patch([(-.87,-5.616,-.06),(.87,-5.616,-.06),(.86,-5.62,-.13),(-.86,-5.62,-.13)],dark,'Terminal mouth')
    else:
        for sign in (-1,1):
            for j in range(13):
                y=-3.8+j*.58
                pts=[]
                for k in range(8):
                    t=.10+k*.225
                    yy=y+.20*math.sin(t*2+j*.7)
                    pts.append(surface(yy,sign*t,.014))
                for k in reversed(range(8)):
                    t=.10+k*.225;yy=y+.20*math.sin(t*2+j*.7)+.16*(1-k/8)
                    pts.append(surface(yy,sign*t,.014))
                patch(pts,(.065,.12,.11),'Tiger bars',ribbon=True)
    # Five gill slits along either side, not separate floating objects.
    for sign in (-1,1):
        for i in range(5):
            y=-3.8+i*.19
            pts=[surface(y+.035*k/6,sign*(.97+k*.168),.018) for k in range(7)]
            pts += [surface(y+.045+.035*k/6,sign*(.97+k*.168),.018) for k in reversed(range(7))]
            patch(pts,dark,'Gill slits',ribbon=True)
    def fin(name,outline,bulge,color=top):
        center=sum((Vector(p) for p in outline),Vector())/len(outline)
        points=list(outline)+[tuple(center+Vector(bulge)),tuple(center-Vector(bulge))]
        n=len(outline);fs=[]
        for i in range(n):fs.extend([(i,(i+1)%n,n),((i+1)%n,i,n+1)])
        return mesh(name,points,fs,[color]*len(points),[weight(p[1]) for p in points],arm,mat)
    # Separate dorsal placement and outlines are intentional species geometry.
    dy=1.25 if whale else -.8
    fin('First dorsal',[(0,dy-1,.55),(0,dy+.05,1.82 if whale else 1.93),(0,dy+.47,1.90 if whale else 2.04),(0,dy+.40,1.04),(0,dy+1,.39)],(.12,0,0))
    fin('Second dorsal',[(0,3,.23),(0,3.7,.72),(0,3.65,.33),(0,4.15,.17)],(.045,0,0))
    for sign in (-1,1):
        fin('Pectoral fin',[(sign*.85,-2.85,-.26),(sign*(2.65 if whale else 2.35),-.70,-.80),(sign*2.55,-.28,-.84),(sign*.83,-1.35,-.43)],(0,0,.085))
        fin('Pelvic fin',[(sign*.42,1.5,-.23),(sign*.99,2.6,-.45),(sign*.74,2.72,-.47),(sign*.25,2.4,-.20)],(0,0,.045))
    fin('Asymmetric crescent tail',[(0,4.65,.09),(0,5.20,1.1),(0,6.08,2.20 if whale else 2.57),(0,6.30,2.27 if whale else 2.67),(0,5.78,.39),(0,5.64,.02),(0,6.05,-1.26 if whale else -.97),(0,5.76,-1.20 if whale else -.92),(0,4.9,-.14)],(.07,0,0))
    # Eyes are embedded near the corners of the broad snout.
    for sign in (-1,1):
        y=-5.1 if whale else -4.75;t=sign*1.33
        pos=surface(y,t,.025)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=10,ring_count=6,radius=.07 if whale else .085,location=pos)
        eye=bpy.context.object
        points=[tuple(eye.matrix_world@v.co) for v in eye.data.vertices];fs=[tuple(p.vertices) for p in eye.data.polygons]
        bpy.data.objects.remove(eye,do_unlink=True)
        mesh('Eye',points,fs,[(.007,.014,.013)]*len(points),[weight(p[1]) for p in points],arm,mat)
    return arm,11.9

def manta():
    bpy.ops.wm.open_mainfile(filepath=str(OUT/'source/manta.blend'),load_ui=False,use_scripts=False)
    scene=bpy.context.scene;scene.frame_set(0)
    arm=next(o for o in scene.objects if o.type=='ARMATURE');body=next(o for o in scene.objects if o.type=='MESH')
    bpy.context.view_layer.objects.active=body
    sub=body.modifiers.new('Smooth silhouette','SUBSURF');sub.levels=1
    bpy.ops.object.modifier_move_up(modifier=sub.name);bpy.ops.object.modifier_apply(modifier=sub.name)
    # Slightly broader disc and fuller shoulders; preserve the existing weighted wing rig.
    for v in body.data.vertices:
        if -2.3<v.co.y<1.8:v.co.x*=1.08
    mat=material();oldmats=list(body.data.materials)
    colors=[]
    attr=body.data.color_attributes.new(name='Color',type='BYTE_COLOR',domain='CORNER')
    for p in body.data.polygons:
        bottom=oldmats[p.material_index].name=='Bottom';p.use_smooth=True
        for li in p.loop_indices:
            co=body.data.vertices[body.data.loops[li].vertex_index].co
            # Pale shoulder patches form a dark V toward the head.
            def smooth(v):
                t=max(0,min(1,v));return t*t*(3-2*t)
            shoulder=smooth((co.y+2.12)/.42)*smooth((-.15-co.y)/.45)*smooth((abs(co.x)-.28-(-co.y)*.18)/.24)*smooth((1.25-abs(co.x))/.30)
            pale=(.72,.77,.69);dark=(.027,.073,.084)
            col=pale if bottom else tuple(a*(1-shoulder)+b*shoulder for a,b in zip(dark,pale))
            attr.data[li].color=(*col,1)
        p.material_index=0
    body.data.materials.clear();body.data.materials.append(mat);body.data.validate()
    tree=BVHTree.FromPolygons([v.co for v in body.data.vertices],[tuple(p.vertices) for p in body.data.polygons])
    def projected(x,y,above):
        loc,normal,index,dist=tree.ray_cast(Vector((x,y,5 if above else -5)),Vector((0,0,-1 if above else 1)))
        if loc is None:return None
        # Nearest body vertex transfers its deform weights onto painted surface detail.
        poly=body.data.polygons[index]
        v=min((body.data.vertices[i] for i in poly.vertices),key=lambda v:(v.co-loc).length)
        ws={body.vertex_groups[g.group].name:g.weight for g in v.groups}
        return tuple(loc+normal*.013),ws
    for x,y,r in [(-.36,-.12,.10),(.32,.17,.13),(-.20,.43,.12),(.10,.70,.085),(.49,.62,.065),(-.46,.86,.075)]:
        hits=[projected(x+math.cos(TAU*i/8)*r,y+math.sin(TAU*i/8)*r,False) for i in range(8)]
        if all(hits):mesh('Individual belly spots',[p for p,w in hits],[tuple(reversed(range(8)))],[(.035,.075,.08)]*8,[w for p,w in hits],arm,mat)
    for x in (-.59,.59):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=10,ring_count=6,radius=.085,location=(x,-2.4,.18))
        eye=bpy.context.object;pts=[tuple(eye.matrix_world@v.co) for v in eye.data.vertices];fs=[tuple(p.vertices) for p in eye.data.polygons];bpy.data.objects.remove(eye,do_unlink=True)
        mesh('Eye',pts,fs,[(.005,.012,.015)]*len(pts),[{'Head':1}]*len(pts),arm,mat)
    return arm,11.72

def render(kind):
    scene=bpy.context.scene;scene.frame_set(0);scene.render.engine='CYCLES';scene.cycles.samples=24
    scene.render.resolution_x=1000;scene.render.resolution_y=760;scene.render.resolution_percentage=100
    world=bpy.data.worlds.new('Studio');scene.world=world;world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.71,.70,1);world.node_tree.nodes['Background'].inputs[1].default_value=.7
    for name,pos,power,size in [('Key',(0,-1,3),160,3),('Rim',(-2,1,1),90,2)]:
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.size=size
        obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=pos;obj.rotation_euler=(-obj.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new('Camera');camera=bpy.data.objects.new('Camera',data);scene.collection.objects.link(camera);scene.camera=camera
    camera.location=(1.15,-1.2,1.5);camera.rotation_euler=(Vector((0,0,.02))-camera.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=1.25
    scene.render.filepath=str(PREVIEW/(kind+'.png'));bpy.ops.render.render(write_still=True)

SPECIES={
    'whale-shark':('Rhincodon typus','https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/whale-shark/'),
    'tiger-shark':('Galeocerdo cuvier','https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/tiger-shark/'),
    'reef-manta':('Mobula alfredi','https://www.mantatrust.org/mobula-alfredi'),
}
report={}
for kind in ('whale-shark','tiger-shark','reef-manta'):
    arm,length=manta() if kind=='reef-manta' else shark(kind)
    scene=bpy.context.scene;scene.frame_set(0)
    # One skinned draw call per animal, including all painted surface geometry.
    bpy.ops.object.select_all(action='DESELECT')
    meshes=[o for o in scene.objects if o.type=='MESH']
    for o in meshes:o.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join()
    root=bpy.data.objects.new(kind,None);scene.collection.objects.link(root)
    for o in list(scene.objects):
        if o!=root and o.parent is None:o.parent=root
    root.scale=(1/length,)*3;scene.render.fps=24
    action=arm.animation_data.action;action.name='Swim'
    scene.frame_start=int(action.frame_range[0]);scene.frame_end=int(action.frame_range[1])
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(OUT/(kind+'.glb')),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=True,export_skins=True,export_yup=True)
    report[kind]={'status':'stylized-draft','version':1,'bytes':(OUT/(kind+'.glb')).stat().st_size,'source':'Original procedural geometry and rig' if kind!='reef-manta' else 'Adapted Quaternius CC0 manta rig','frames':[scene.frame_start,scene.frame_end],'fps':24}
    report[kind].update({'scientificName':SPECIES[kind][0],'reference':SPECIES[kind][1],'humanReview':'pending','clip':'Swim','material':'vertex colors, no textures','generator':'scripts/art/prepare-species.py'})
    if '--export-only' not in sys.argv:render(kind)
(OUT/'species-manifest.json').write_text(json.dumps(report,indent=2)+'\n')
