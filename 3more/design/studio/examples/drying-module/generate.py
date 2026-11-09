"""New agent-authored conceptual geometry; not a fixed catalog template or CAD design."""
import bpy, math, json, hashlib
from pathlib import Path
from datetime import datetime, timezone
from mathutils import Vector
out=Path(__file__).resolve().parent
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def material(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.9
 return m
neutral=material('neutral source',(.58,.62,.61))
mat=material('teal vessel',(.20,.52,.54));light=material('mint planes',(.51,.73,.69));dark=material('dark supports',(.18,.31,.32));gold=material('ochre collection',(.72,.53,.19));base=material('warm stone',(.81,.83,.75))
objects=[]
def finish(o,name,m):
 o.name=name;o.data.materials.append(m);objects.append(o);return o
def box(name,loc,scale,m):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.scale=scale;return finish(o,name,m)
def cone(name,loc,r1,r2,depth,m):
 bpy.ops.mesh.primitive_cone_add(vertices=8,radius1=r1,radius2=r2,depth=depth,location=loc);return finish(bpy.context.object,name,m)
def pipe(name,a,b,r,m):
 a,b=Vector(a),Vector(b);o=cone(name,(a+b)/2,r,r,(b-a).length,m);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
box('concept plinth',(0,0,-.12),(9,6,.24),base)
# A new silhouette: tall octagonal chamber, tapered outlet, external cyclone,
# independent collection bin and service gantry. Arbitrary visual units only.
cone('drying chamber',(-1,0,3.7),1.15,1.15,2.4,mat)
cone('faceted chamber cap',(-1,0,5.05),1.15,.75,.3,light)
cone('tapered hopper',(-1,0,1.9),.25,1.15,1.2,light)
pipe('powder outlet',(-1,0,.8),(-1,0,1.3),.23,mat)
for x,y in [(-2,-.85),(-2,.85),(0,-.85),(0,.85)]:box('support column',(x,y,1.25),(.16,.16,2.5),dark)
cone('sealed collection bin',(-1,0,.4),.48,.48,.8,gold)
cone('cyclone body',(2,0,3.1),.62,.62,1.3,light)
cone('cyclone cone',(2,0,2.05),.16,.62,.8,mat)
cone('cyclone cap',(2,0,3.85),.62,.3,.2,light)
pipe('transfer duct',(0,0,4.3),(2,0,4.3),.18,dark)
pipe('cyclone inlet',(2,0,3.8),(2,0,4.3),.18,dark)
pipe('cyclone exhaust',(2,0,4),(2,0,5.1),.16,mat)
for x in [1.6,2.4]:box('cyclone leg',(x,0,1),(.12,.12,2),dark)
box('collection trolley',(2,0,.45),(1.05,.85,.9),gold)
box('service platform',(-1,1.6,2.4),(3,1,.15),dark)
for x in [-2.4,.4]:
 box('platform leg',(x,1.9,1.2),(.12,.12,2.4),dark)
 pipe('guardrail post',(x,1.9,2.5),(x,1.9,3.1),.045,light)
pipe('guardrail',(-2.4,1.9,3.1),(.4,1.9,3.1),.045,light)
for z in [.3,.6,.9,1.2,1.5,1.8,2.1]:box('ladder rung',(-2.5,1.2,z),(.5,.08,.07),gold)
for x in [-2.75,-2.25]:pipe('ladder rail',(x,1.2,.1),(x,1.2,2.5),.04,dark)
box('control cabinet',(-3,-1.3,.65),(.65,.4,1.3),light)
box('control display',(-3,-1.51,.95),(.4,.025,.3),dark)
original_mats=[o.data.materials[0] for o in objects]
for o in objects:o.data.materials[0]=neutral
bpy.ops.export_scene.gltf(filepath=str(out/'source.glb'),export_format='GLB')
for o,m in zip(objects,original_mats):o.data.materials[0]=m
bpy.ops.export_scene.gltf(filepath=str(out/'jovey-styled.glb'),export_format='GLB')
receipt={'job_id':'local-drying-concept-v1','provider':'local-blender','provider_task_id':None,'method':'procedural','output_sha256':hashlib.sha256((out/'source.glb').read_bytes()).hexdigest(),'finished_at':datetime.now(timezone.utc).isoformat()}
(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
scene=bpy.context.scene
bpy.ops.object.camera_add(location=(10,-15,10));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,2.1))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=11.8;scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=24
scene.world.color=(.8,.8,.8)
bpy.ops.object.light_add(type='AREA',location=(1,-5,10));bpy.context.object.data.energy=1800;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=8
scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(out/'preview.png');scene.render.film_transparent=False
bpy.ops.wm.save_as_mainfile(filepath=str(out/'concept.blend'))
bpy.ops.render.render(write_still=True)
