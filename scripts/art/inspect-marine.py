import bpy, sys, json
from pathlib import Path
root = Path(__file__).resolve().parents[2]
for path in sorted((root / 'assets/models/marine/source').glob('*.blend')):
    bpy.ops.wm.open_mainfile(filepath=str(path), load_ui=False, use_scripts=False)
    print('MODEL',path.name)
    print('OBJECTS',[(o.name,o.type,tuple(round(v,3) for v in o.dimensions),[(m.name,m.type) for m in o.modifiers]) for o in bpy.context.scene.objects])
    print('MATERIALS',[(m.name,tuple(m.diffuse_color)) for m in bpy.data.materials])
    print('ACTIONS',[(a.name,tuple(a.frame_range)) for a in bpy.data.actions])
    for o in bpy.context.scene.objects:
        if o.type=='ARMATURE': print('BONES',[(b.name,tuple(b.head_local),tuple(b.tail_local)) for b in o.data.bones])
