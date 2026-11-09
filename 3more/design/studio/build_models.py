import bpy, math
from pathlib import Path
out=Path(__file__).resolve().parent/'models'
for kind in ['research','production','greenhouse','warehouse']:
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 def box(name,loc,scale,c):
  bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.scale=scale
  m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);o.data.materials.append(m);return o
 main=(.62,.65,.64);dark=(.3,.35,.35);glass=(.7,.85,.87)
 box('Foundation',(0,0,-.15),(9,7,.3),(.8,.82,.77))
 box('Building',(0,0,1.5),(5,3.5,3),main)
 if kind=='research':
  box('Research wing',(2.7,0,1),(2.5,3,2),main)
  box('Upper lab',(-1,0,3.4),(2,2,.8),main)
  for x in [-1.6,0,1.6]:box('Window',(x,-1.76,1.9),(1,.04,1),glass)
 elif kind=='production':
  for x in [-2,0,2]:
   bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=.7,depth=3.2,location=(x,-2.2,1.6));o=bpy.context.object;o.name='Production vessel';m=bpy.data.materials.new('Vessel');m.diffuse_color=(*main,1);o.data.materials.append(m)
   box('Vent',(x,-2.2,3.5),(.25,.25,.6),dark)
 elif kind=='greenhouse':
  # Faceted roof using a triangular prism.
  mesh=bpy.data.meshes.new('Roof');mesh.from_pydata([(-2.5,-1.75,3),(2.5,-1.75,3),(0,-1.75,4.5),(-2.5,1.75,3),(2.5,1.75,3),(0,1.75,4.5)],[],[(0,1,2),(3,5,4),(0,3,4,1),(0,2,5,3),(1,4,5,2)]);o=bpy.data.objects.new('Roof',mesh);bpy.context.collection.objects.link(o);m=bpy.data.materials.new('Glass roof');m.diffuse_color=(*glass,1);o.data.materials.append(m)
  for x in [-1.5,0,1.5]:box('Growing bed',(x,-2.5,.3),(1,1,.6),(.35,.6,.35))
 elif kind=='warehouse':
  box('Loading door',(0,-1.76,1.2),(2.4,.04,2.4),dark)
  for x,y in [(2,-2.7),(3,-2),(3.1,-3)]:box('Crate',(x,y,.45),(.8,.8,.9),(.65,.55,.35))
 bpy.ops.export_scene.gltf(filepath=str(out/(kind+'.glb')),export_format='GLB')
