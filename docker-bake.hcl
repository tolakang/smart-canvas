# Multi-arch images (D29: amd64 staging, arm64 production).
#   docker buildx bake -f docker-bake.hcl --push              # all three, both platforms
#   IMAGE_TAG=v0.1.0 docker buildx bake -f docker-bake.hcl --push api
# (-f matters: without it bake also merges docker-compose.yml.)
variable "IMAGE_REGISTRY" { default = "ghcr.io/tolakang/smart-canvas" }
variable "IMAGE_TAG" { default = "latest" }

group "default" { targets = ["web", "api", "worker"] }

target "_common" {
  context    = "."
  dockerfile = "Dockerfile"
  platforms  = ["linux/amd64", "linux/arm64"]
}

target "web" {
  inherits = ["_common"]
  target   = "web"
  tags     = ["${IMAGE_REGISTRY}/web:${IMAGE_TAG}"]
}

target "api" {
  inherits = ["_common"]
  target   = "api"
  tags     = ["${IMAGE_REGISTRY}/api:${IMAGE_TAG}"]
}

target "worker" {
  inherits = ["_common"]
  target   = "worker"
  tags     = ["${IMAGE_REGISTRY}/worker:${IMAGE_TAG}"]
}
