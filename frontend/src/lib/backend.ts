// Singleton backend module - avoids repeated dynamic imports
let _backend: typeof import('../../wailsjs/go/main/App') | null = null

export async function getBackend() {
  if (!_backend) {
    _backend = await import('../../wailsjs/go/main/App')
  }
  return _backend
}
