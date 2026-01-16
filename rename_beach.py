import os
import re

base_dir = r"c:\Users\lcane\Desktop\openbeach\escoresheet\frontend\src_beach_new"

# Directories to process
dirs_to_rename = [
    "components_beach",
    "contexts_beach",
    "hooks_beach",
    "db_beach",
    "utils_beach",
    "lib_beach",
    "i18n_beach"
]

# Files to rename (basename -> new_basename)
# We'll also rename all .js and .jsx files in those directories later.

def rename_files_recursively(root_dir):
    renamed_map = {}
    for root, dirs, files in os.walk(root_dir):
        for file in files:
            if file.endswith((".js", ".jsx")) and not file.endswith("_beach.js") and not file.endswith("_beach.jsx"):
                basename, ext = os.path.splitext(file)
                if basename in ["main-beach", "App_beach"]: continue # Skip already renamed
                
                old_path = os.path.join(root, file)
                new_basename = basename + "_beach"
                new_file = new_basename + ext
                new_path = os.path.join(root, new_file)
                
                # Check if it's already renamed (e.g. from previous run)
                if not os.path.exists(new_path):
                    os.rename(old_path, new_path)
                    print(f"Renamed: {file} -> {new_file}")
                
                renamed_map[basename] = new_basename
    return renamed_map

# Map of folder names from openvolley to openbeach
folder_map = {
    "components": "components_beach",
    "contexts": "contexts_beach",
    "hooks": "hooks_beach",
    "db": "db_beach",
    "utils": "utils_beach",
    "lib": "lib_beach",
    "i18n": "i18n_beach",
    "styles.css": "styles_beach.css"
}

def update_imports(root_dir):
    for root, dirs, files in os.walk(root_dir):
        for file in files:
            if file.endswith((".js", ".jsx", ".css")):
                file_path = os.path.join(root, file)
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()
                
                new_content = content
                
                # Update folder imports
                for old_f, new_f in folder_map.items():
                    # Match imports like './components/' or '../components/'
                    new_content = new_content.replace(f"/{old_f}/", f"/{new_f}/")
                    new_content = new_content.replace(f"'./{old_f}'", f"'./{new_f}'")
                    new_content = new_content.replace(f"\"./{old_f}\"", f"\"./{new_f}\"")
                
                # Update file imports (this is tricky, we'll try to match common patterns)
                # import X from './components_beach/X' -> './components_beach/X_beach'
                for folder in folder_map.values():
                    pattern = rf"(['\"])((\.\.?/)+{folder}/)([^'\"]+)(['\"])"
                    def replace_func(match):
                        quote = match.group(1)
                        prefix = match.group(2)
                        filename = match.group(4)
                        if filename.endswith(".png") or filename.endswith(".jpg") or filename.endswith(".svg"):
                            return match.group(0)
                        if "_beach" in filename:
                            return match.group(0)
                        return f"{quote}{prefix}{filename}_beach{quote}"
                    
                    new_content = re.sub(pattern, replace_func, new_content)

                # Special case for App, RefereeApp etc if they are imported
                new_content = new_content.replace("'./App'", "'./App_beach'")
                new_content = new_content.replace("\"./App\"", "\"./App_beach\"")
                
                if new_content != content:
                    with open(file_path, "w", encoding="utf-8") as f:
                        f.write(new_content)
                    print(f"Updated imports in: {file}")

print("Phase 1: Renaming files...")
rename_files_recursively(base_dir)

print("Phase 2: Updating imports...")
update_imports(base_dir)

print("Done!")
