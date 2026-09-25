"""Refine Quaternius' CC0 source rigs and export texture-free, mobile-ready GLBs.
Run: blender --background --factory-startup --python scripts/art/prepare-marine.py
"""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/models/marine'
PREVIEW = ROOT / 'docs/art-previews'
PREVIEW.mkdir(parents=True, exist_ok=True)
report = {}
for kind in ('shark','manta','reef-fish'):
    bpy.ops.wm.open_mainfile(filepath=str(OUT / 'source' / (kind+'.blend')), load_ui=False, use_scripts=False)
    scene=bpy.context.scene
    arm=next(o for o in scene.objects if o.type=='ARMATURE')
    body=next(o for o in scene.objects if o.type=='MESH')
    scene.frame_set(0)
    # Smooth the artist's silhouette while preserving the original weighted rig.
    bpy.context.view_layer.objects.active=body
    body.select_set(True)
    sub=body.modifiers.new('Sculpted surface','SUBSURF')
    sub.levels=1; sub.render_levels=1
    bpy.ops.object.modifier_move_up(modifier=sub.name)
    bpy.ops.object.modifier_apply(modifier=sub.name)
    for poly in body.data.polygons: poly.use_smooth=True
    for mat in bpy.data.materials:
        base=tuple(mat.diffuse_color)
        if kind=='shark': base=(.17,.27,.31,1) if mat.name=='Top' else (.70,.76,.70,1)
        if kind=='manta': base=(.09,.18,.22,1) if mat.name=='Top' else (.72,.79,.73,1)
        mat.use_nodes=True
        mat.node_tree.nodes.clear()
        bsdf=mat.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
        output=mat.node_tree.nodes.new('ShaderNodeOutputMaterial')
        mat.node_tree.links.new(bsdf.outputs['BSDF'],output.inputs['Surface'])
        bsdf.inputs['Base Color'].default_value=base
        bsdf.inputs['Roughness'].default_value=.95
        bsdf.inputs['Metallic'].default_value=0
        mat.diffuse_color=base
    # Small embedded eyes follow the original head bone instead of floating in space.
    if kind=='shark': eye_positions=[(-.66,-5.91,.62),(.66,-5.91,.62)]; eye_size=.12
    elif kind=='manta': eye_positions=[(-.57,-2.40,.18),(.57,-2.40,.18)]; eye_size=.085
    else: eye_positions=[(-.31,-2.35,.23),(.31,-2.35,.23)]; eye_size=.075
    eye_mat=bpy.data.materials.new('Obsidian eyes'); eye_mat.diffuse_color=(.009,.018,.020,1); eye_mat.use_nodes=True
    eye_bsdf=eye_mat.node_tree.nodes.get('Principled BSDF'); eye_bsdf.inputs['Base Color'].default_value=eye_mat.diffuse_color; eye_bsdf.inputs['Roughness'].default_value=.22
    head='Head' if kind=='manta' else 'Face'
    for pos in eye_positions:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, radius=eye_size, location=pos)
        eye=bpy.context.object; eye.name='Eye'; eye.data.materials.append(eye_mat)
        for p in eye.data.polygons:p.use_smooth=True
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        group=eye.vertex_groups.new(name=head); group.add(list(range(len(eye.data.vertices))),1,'REPLACE')
        mod=eye.modifiers.new('Follow head','ARMATURE'); mod.object=arm
        eye.parent=arm
    # Normalize around the source origin; glTF converts Blender -Y forward to +Z.
    bounds=[body.matrix_world @ Vector(c) for c in body.bound_box]
    length=max(p.y for p in bounds)-min(p.y for p in bounds)
    root=bpy.data.objects.new(kind,None); scene.collection.objects.link(root)
    for o in list(scene.objects):
        if o!=root and o.parent is None:o.parent=root
    root.scale=(1/length,)*3
    scene.render.fps=24
    action=arm.animation_data.action
    scene.frame_start=int(action.frame_range[0]); scene.frame_end=int(action.frame_range[1])
    action.name='Swim'
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(OUT/(kind+'.glb')),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=True,export_skins=True,export_yup=True)
    report[kind]={'source':'Quaternius Animated Fish Pack (CC0)','frames':[scene.frame_start,scene.frame_end],'fps':24,'bytes':(OUT/(kind+'.glb')).stat().st_size,'vertices':len(body.data.vertices)}
    if '--export-only' in sys.argv: continue
    # A studio contact sheet frame of the actual processed asset, not concept art.
    scene.frame_set(round(scene.frame_end*.25))
    scene.render.engine='CYCLES'; scene.cycles.samples=24
    scene.render.resolution_x=900; scene.render.resolution_y=700; scene.render.resolution_percentage=100
    scene.world.color=(.45,.45,.45)
    world=scene.world; world.use_nodes=True; world.node_tree.nodes['Background'].inputs[0].default_value=(.65,.78,.76,1); world.node_tree.nodes['Background'].inputs[1].default_value=.5
    def area(name,loc,power,size):
        data=bpy.data.lights.new(name,'AREA'); data.energy=power; data.shape='DISK';data.size=size
        obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=loc;obj.rotation_euler=(Vector((0,0,0))-obj.location).to_track_quat('-Z','Y').to_euler()
    area('Softbox',(1,-1,3),160,3);area('Fill',(-2,1,1),80,2)
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.23))
    plane=bpy.context.object; mat=bpy.data.materials.new('Sea glass backdrop');mat.diffuse_color=(.48,.68,.63,1);plane.data.materials.append(mat)
    camera_data=bpy.data.cameras.new('Camera');camera=bpy.data.objects.new('Camera',camera_data);scene.collection.objects.link(camera);scene.camera=camera
    camera.location=(1.1,-1.4,1.35);target=Vector((0,0,.01));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.type='ORTHO';camera_data.ortho_scale=1.48
    scene.render.filepath=str(PREVIEW/(kind+'.png'));bpy.ops.render.render(write_still=True)
(OUT/'manifest.json').write_text(json.dumps(report,indent=2)+'\n')
