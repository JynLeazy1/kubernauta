#!/usr/bin/env bash
# Demuestra cuándo Podman usa (y cuándo NO usa) el user namespace.
# Ejecutar como root en el host: `sudo bash test-podman-userns.sh`

set -euo pipefail

USER_NAME="testuser"
IMG="alpine"

log() { printf '\n\033[1;36m=== %s ===\033[0m\n' "$*"; }

# -----------------------------------------------------------------------------
# 0) Pre-flight
# -----------------------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
  echo "Ejecuta este script como root (sudo bash $0)"; exit 1
fi

command -v podman >/dev/null || { echo "podman no está instalado"; exit 1; }

# -----------------------------------------------------------------------------
# 1) Crear el usuario si no existe
# -----------------------------------------------------------------------------
log "1) Preparar usuario $USER_NAME (sin sudoers todavía)"
if ! id -u "$USER_NAME" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$USER_NAME"
  echo "Usuario $USER_NAME creado."
else
  echo "Usuario $USER_NAME ya existe."
fi

# Verificar /etc/subuid y /etc/subgid (useradd los agrega por defecto en distros modernas)
if ! grep -q "^$USER_NAME:" /etc/subuid; then
  echo "$USER_NAME:100000:65536" >> /etc/subuid
fi
if ! grep -q "^$USER_NAME:" /etc/subgid; then
  echo "$USER_NAME:100000:65536" >> /etc/subgid
fi
echo "/etc/subuid: $(grep ^$USER_NAME: /etc/subuid)"
echo "/etc/subgid: $(grep ^$USER_NAME: /etc/subgid)"

# Asegurar que $USER_NAME NO esté en sudoers todavía
gpasswd --delete "$USER_NAME" sudo 2>/dev/null || true

# -----------------------------------------------------------------------------
# 2) Caso 1 — Podman como ROOT directo
# -----------------------------------------------------------------------------
log "CASO 1 — podman como root directo"
echo "cmd: podman run --rm $IMG cat /proc/self/uid_map"
podman run --rm "$IMG" cat /proc/self/uid_map || true

# -----------------------------------------------------------------------------
# 3) Caso 2 — Podman como usuario normal (sin sudo, NO es sudoer)
# -----------------------------------------------------------------------------
log "CASO 2 — podman como $USER_NAME (no sudoer, sin sudo)"
echo "cmd: sudo -u $USER_NAME -- podman run --rm $IMG cat /proc/self/uid_map"
# -i para forzar login shell (importante: XDG_RUNTIME_DIR etc. se inicializan)
sudo -u "$USER_NAME" -i podman run --rm "$IMG" cat /proc/self/uid_map || true

# -----------------------------------------------------------------------------
# 4) Caso 3a — Promover $USER_NAME a sudoer y reintentar con sudo
# -----------------------------------------------------------------------------
log "4) Promover $USER_NAME al grupo sudo"
usermod -aG sudo "$USER_NAME"
# Permitir sudo sin contraseña para el script (limpio al final)
SUDOERS_FILE="/etc/sudoers.d/99-$USER_NAME-test"
echo "$USER_NAME ALL=(ALL) NOPASSWD:ALL" > "$SUDOERS_FILE"
chmod 440 "$SUDOERS_FILE"

log "CASO 3 — podman como $USER_NAME (sudoer) pero con sudo delante"
echo "cmd: sudo -u $USER_NAME -i sudo podman run --rm $IMG cat /proc/self/uid_map"
sudo -u "$USER_NAME" -i sudo podman run --rm "$IMG" cat /proc/self/uid_map || true

# -----------------------------------------------------------------------------
# 5) Resumen
# -----------------------------------------------------------------------------
log "Resumen esperado"
cat <<'EOF'
CASO 1 (root directo):               0   0   4294967295   ← identity, sin userns real
CASO 2 (usuario normal, sin sudo):   0  <uid>    1
                                     1  100000  65536     ← rootless REAL
CASO 3 (sudoer, con sudo):           0   0   4294967295   ← igual que CASO 1

Lección: "sudo podman" NO es rootless. Ser sudoer no cambia nada — lo que
importa es si el proceso ejecutó podman como root o como no-root.
EOF

# -----------------------------------------------------------------------------
# 6) Cleanup opcional (comentar para conservar el usuario)
# -----------------------------------------------------------------------------
log "Cleanup"
rm -f "$SUDOERS_FILE"
echo "Sudoers temporal eliminado: $SUDOERS_FILE"
echo "El usuario $USER_NAME se conserva. Para borrarlo:"
echo "  userdel -r $USER_NAME"
