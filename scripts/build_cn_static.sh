#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dist_dir="$project_dir/dist-cn"

if ! command -v rsync >/dev/null 2>&1; then
    printf 'rsync is required to build the mainland-China static package.\n' >&2
    exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
    printf 'jq is required to validate the photo manifest.\n' >&2
    exit 1
fi

# dist-cn is generated output owned by this script. Keep the deletion target fixed
# so the build can never remove source files or another user-selected directory.
if [[ -d "$dist_dir" ]]; then
    find "$dist_dir" -mindepth 1 -delete
else
    mkdir -p "$dist_dir"
fi

find "$project_dir" -maxdepth 1 -type f -name '*.html' -exec cp {} "$dist_dir/" \;
cp "$project_dir/favicon.svg" "$dist_dir/favicon.svg"

for public_dir in css js; do
    rsync -a --exclude='.DS_Store' "$project_dir/$public_dir/" "$dist_dir/$public_dir/"
done

# The public CDN package deliberately excludes the admin/API implementation and
# the 128 MB source-photo directory. Browser-ready responsive WebP variants are
# copied from photos-optimized instead.
rsync -a \
    --exclude='.DS_Store' \
    --exclude='images/photos/' \
    "$project_dir/assets/" "$dist_dir/assets/"

required_files=(
    index.html
    favicon.svg
    photos.html
    lyrics.html
    lyric-detail.html
    music.html
    music-player.html
    knowledge.html
    knowledge-detail.html
    projects.html
    resume.html
    resume-proof.html
    js/image-utils.js
    assets/data/photos.json
    assets/vendor/lucide-1.45.0.min.js
)

for required_file in "${required_files[@]}"; do
    if [[ ! -f "$dist_dir/$required_file" ]]; then
        printf 'Missing required public file: %s\n' "$required_file" >&2
        exit 1
    fi
done

if [[ -e "$dist_dir/admin" || -e "$dist_dir/api" || -e "$dist_dir/assets/images/photos" ]]; then
    printf 'Private/runtime files or original gallery photos leaked into dist-cn.\n' >&2
    exit 1
fi

while IFS= read -r photo_source; do
    filename="${photo_source##*/}"
    stem="${filename%.*}"
    for width in 640 1280 1920; do
        variant="assets/images/photos-optimized/${stem}-${width}.webp"
        if [[ ! -f "$dist_dir/$variant" ]]; then
            printf 'Missing responsive photo variant: %s\n' "$variant" >&2
            exit 1
        fi
    done
done < <(jq -r '.[].src | select(startswith("assets/images/photos/"))' "$project_dir/assets/data/photos.json")

file_count="$(find "$dist_dir" -type f | wc -l | tr -d ' ')"
package_size="$(du -sh "$dist_dir" | awk '{print $1}')"

printf 'Built mainland-China static package: %s files, %s\n' "$file_count" "$package_size"
printf 'Output: %s\n' "$dist_dir"
