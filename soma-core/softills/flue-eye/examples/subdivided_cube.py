"""
Creative Recorder — Replay Script
自动生成的场景重建脚本

原始场景: Cube (细分曲面) + Starlight Sun 灯光
"""

import bpy
import math


def recreate_scene():
    """重建录制的场景"""

    # ── 清空场景 ──
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()

    # ── 1. 建 Cube ──
    bpy.ops.mesh.primitive_cube_add(location=(0, 0, 0))
    cube = bpy.context.active_object
    cube.name = "Cube"

    # ── 2. 加细分曲面修改器 ──
    bpy.ops.object.modifier_add(type="SUBSURF")
    subsurf = cube.modifiers["Subdivision"]
    subsurf.levels = 2
    subsurf.render_levels = 2

    # ── 3. 建灯光 "Starlight Sun" ──
    bpy.ops.object.light_add(type="SUN", location=(0, 0, 10))
    light = bpy.context.active_object
    light.name = "Starlight Sun"
    light.rotation_euler = (-1.519, 0.0, 0.692)

    print(f"Scene recreated: Cube ({cube.data.vertices} verts) + {light.name}")
    return {"cube": cube.name, "light": light.name}


if __name__ == "__main__":
    result = recreate_scene()
    print("Done:", result)
