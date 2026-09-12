#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dist_dir="$project_dir/dist-cn"
mode="${CN_UPLOAD_MODE:-preview}"

: "${ALIYUN_OSS_BUCKET:?Set ALIYUN_OSS_BUCKET to the destination bucket name.}"

oss_prefix="${ALIYUN_OSS_PREFIX:-}"
oss_prefix="${oss_prefix#/}"
oss_prefix="${oss_prefix%/}"

if [[ -n "$oss_prefix" ]]; then
    destination="oss://${ALIYUN_OSS_BUCKET}/${oss_prefix}/"
else
    destination="oss://${ALIYUN_OSS_BUCKET}/"
fi

"$project_dir/scripts/build_cn_static.sh"

if [[ "$mode" == "preview" ]]; then
    printf 'Preview only; no OSS data was changed.\n'
    printf 'Source: %s/\n' "$dist_dir"
    printf 'Destination: %s\n' "$destination"
    printf 'To upload after review, set CN_UPLOAD_MODE=upload and CN_DEPLOY_CONFIRM=upload-deanhuo-com.\n'
    exit 0
fi

if [[ "$mode" != "upload" ]]; then
    printf 'CN_UPLOAD_MODE must be preview or upload.\n' >&2
    exit 1
fi

if [[ "${CN_DEPLOY_CONFIRM:-}" != "upload-deanhuo-com" ]]; then
    printf 'Upload blocked: CN_DEPLOY_CONFIRM must equal upload-deanhuo-com.\n' >&2
    exit 1
fi

if ! command -v ossutil >/dev/null 2>&1; then
    printf 'ossutil is required for upload. Install and configure ossutil 2.0 first.\n' >&2
    exit 1
fi

# Intentionally no --delete: a release can add/update objects but cannot remove
# the previous working copy. This preserves a quick rollback path.
ossutil sync "$dist_dir/" "$destination" --update

printf 'OSS upload completed without deleting any remote objects.\n'
printf 'Do not change DNS until the CDN preview-domain checklist has passed.\n'
