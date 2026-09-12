#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="$project_dir/assets/images/photos"
output_dir="$project_dir/assets/images/photos-optimized"

if ! command -v node >/dev/null 2>&1 || ! command -v npx >/dev/null 2>&1; then
    printf 'Node.js and npx are required to generate responsive photo variants.\n' >&2
    exit 1
fi

mkdir -p "$output_dir"
stage_dir="$(mktemp -d)"

cleanup_stage_dir() {
    find "$stage_dir" -mindepth 1 -delete 2>/dev/null || true
    rmdir "$stage_dir" 2>/dev/null || true
}
trap cleanup_stage_dir EXIT

for width in 640 1280 1920; do
    width_stage="$stage_dir/$width"
    mkdir -p "$width_stage"

    npx --yes -p sharp-cli@6.1.0 sharp \
        --input "$source_dir/*.{jpg,jpeg,JPG,JPEG,png,PNG,webp,WEBP}" \
        --output "$width_stage" \
        --autoOrient \
        --format webp \
        --quality 80 \
        --effort 5 \
        resize "$width"

    for generated_path in "$width_stage"/*.webp; do
        filename="$(basename "$generated_path")"
        stem="${filename%.*}"
        mv "$generated_path" "$output_dir/${stem}-${width}.webp"
    done

    printf 'Generated %spx photo variants.\n' "$width"
done
