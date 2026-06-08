export default {
  es: `
          <p>Hasta ahora vimos qué hace Kubernetes cuando crea un Pod. En esta sección vamos a replicar ese proceso manualmente — extraer los rootfs de las imágenes, crear el sandbox con <a href="/tutorial/que-es-realmente-un-contenedor/namespaces"><code>unshare</code></a> y <a href="/tutorial/que-es-realmente-un-contenedor/chroot-pivot-root"><code>pivot_root</code></a>, y unir nginx al mismo sandbox. Sin kubelet, sin containerd, sin <code>docker run</code>. Solo llamadas al kernel de Linux.</p>

          <p>Es la extensión natural de lo que hicimos en <a href="/tutorial/que-es-realmente-un-contenedor/construyendo-un-contenedor">construyendo un contenedor desde 0</a>: ahí ensamblamos un container con namespaces propios; ahora ensamblamos <em>dos rootfs</em> que comparten net/ipc/uts gracias a <code>setns()</code>.</p>

          <h2>Preparar los directorios e imágenes</h2>

          <pre><code>mkdir -p /tmp/pod-demo/{pause-img,nginx-img,pause-layers/layer0,pause-overlay/{upper,work,merged}}

docker pull registry.k8s.io/pause:3.9
docker pull nginx:alpine

docker save registry.k8s.io/pause:3.9 -o /tmp/pod-demo/pause.tar
docker save nginx:alpine             -o /tmp/pod-demo/nginx.tar

tar -xf /tmp/pod-demo/pause.tar -C /tmp/pod-demo/pause-img
tar -xf /tmp/pod-demo/nginx.tar -C /tmp/pod-demo/nginx-img</code></pre>

          <h2>Extraer capas y montar los OverlayFS</h2>

          <p>El <code>manifest.json</code> dentro de cada tarball describe las capas que componen la imagen y el orden en que deben aplicarse. Para pause hay una sola capa — el binario estático. Para nginx:alpine hay ocho capas, una por instrucción <code>RUN</code> del Dockerfile.</p>

          <pre><code># pause: una capa → extraer directo al layer0
jq -r '.[0].Layers[]' /tmp/pod-demo/pause-img/manifest.json | while read layer; do
  tar -xf "/tmp/pod-demo/pause-img/$layer" -C /tmp/pod-demo/pause-layers/layer0 2>/dev/null || true
done

cat /tmp/pod-demo/pause-img/manifest.json | jq -r '.[0].Layers[]'
# blobs/sha256/e3e5579...   ← una sola capa

cat /tmp/pod-demo/nginx-img/manifest.json | jq -r '.[0].Layers[]'
# blobs/sha256/989e799...
# blobs/sha256/6e27cbd...
# blobs/sha256/bdb037c...   ← ocho capas</code></pre>

          <p>pause no necesita OverlayFS — una sola capa no tiene nada que apilar. Pero sí necesita un mount point para <code>pivot_root</code>, así que montamos igualmente:</p>

          <pre><code># pause: montar overlay (para tener un mount point para pivot_root)
sudo mount -t overlay overlay \
  -o "lowerdir=/tmp/pod-demo/pause-layers/layer0,upperdir=/tmp/pod-demo/pause-overlay/upper,workdir=/tmp/pod-demo/pause-overlay/work" \
  /tmp/pod-demo/pause-overlay/merged</code></pre>

          <p>Para nginx, cada capa va en su propio directorio. OverlayFS las apila en orden inverso — la más reciente tiene mayor prioridad:</p>

          <pre><code># nginx: extraer cada capa en su propio directorio
mapfile -t LAYERS < <(jq -r '.[0].Layers[]' /tmp/pod-demo/nginx-img/manifest.json)
for i in "\${!LAYERS[@]}"; do
  mkdir -p "/tmp/pod-demo/nginx-layers/layer$i"
  tar -xf "/tmp/pod-demo/nginx-img/\${LAYERS[$i]}" -C "/tmp/pod-demo/nginx-layers/layer$i" 2>/dev/null || true
done

# construir lowerdir en orden inverso (capa más reciente primero)
NLAYERS=\${#LAYERS[@]}
LOWERDIRS=""
for ((i=NLAYERS-1; i>=0; i--)); do
  [ -n "$LOWERDIRS" ] && LOWERDIRS="$LOWERDIRS:"
  LOWERDIRS="\${LOWERDIRS}/tmp/pod-demo/nginx-layers/layer$i"
done

mkdir -p /tmp/pod-demo/nginx-overlay/{upper,work,merged}
sudo mount -t overlay overlay \
  -o "lowerdir=$LOWERDIRS,upperdir=/tmp/pod-demo/nginx-overlay/upper,workdir=/tmp/pod-demo/nginx-overlay/work" \
  /tmp/pod-demo/nginx-overlay/merged

ls /tmp/pod-demo/pause-overlay/merged/   # → pause
ls /tmp/pod-demo/nginx-overlay/merged/   # → bin  dev  etc  ...</code></pre>

          <h2>Terminal 1 — Crear el sandbox (pause)</h2>

          <p><code>unshare</code> crea los namespaces nuevos. Abrimos un bash dentro del nuevo entorno para montar <code>/proc</code> antes de hacer <code>pivot_root</code> — una vez cambiado el root, el rootfs del pause solo tiene el binario <code>/pause</code> y no hay herramientas del host disponibles:</p>

          <pre><code>sudo unshare --net --ipc --uts --pid --mount --fork /bin/bash

# Todavía en el filesystem del host — montar proc antes del pivot_root
mkdir -p /tmp/pod-demo/pause-overlay/merged/proc
mount -t proc proc /tmp/pod-demo/pause-overlay/merged/proc

cd /tmp/pod-demo/pause-overlay/merged
mkdir -p .old-root
pivot_root . .old-root
umount -l /.old-root
rmdir /.old-root
exec /pause
# (queda bloqueado esperando señales — exactamente su función)</code></pre>

          <h2>Terminal 2 — Unir nginx al sandbox</h2>

          <p>Con pause corriendo, buscamos su PID en el host. Como en este entorno hay varios procesos pause (Kubernetes los usa también), usamos <code>-n</code> para obtener el más reciente:</p>

          <pre><code>PAUSE_PID=$(pgrep -xn pause)
echo $PAUSE_PID
# 176418

ls -la /proc/$PAUSE_PID/ns/
# ipc -> ipc:[4026532766]
# mnt -> mnt:[4026532763]
# net -> net:[4026532768]
# pid -> pid:[4026532767]
# uts -> uts:[4026532765]</code></pre>

          <p><code>nsenter</code> entra a los namespaces de net, IPC y UTS del pause. <code>unshare</code> crea nuevos namespaces de pid y mnt para nginx. Igual que el pause, montamos <code>/proc</code> antes del <code>pivot_root</code>:</p>

          <pre><code>nsenter --net=/proc/$PAUSE_PID/ns/net \
        --ipc=/proc/$PAUSE_PID/ns/ipc \
        --uts=/proc/$PAUSE_PID/ns/uts \
  unshare --pid --mount --fork /bin/bash

mount -t proc proc /tmp/pod-demo/nginx-overlay/merged/proc
cd /tmp/pod-demo/nginx-overlay/merged
mkdir -p .old-root
pivot_root . .old-root
umount -l /.old-root
rmdir /.old-root
exec /usr/sbin/nginx -g "daemon off;"</code></pre>

          <h2>Terminal 3 — Inspeccionar desde el host</h2>

          <pre><code>PAUSE_PID=$(pgrep -xn pause)
NGINX_PID=$(pgrep -x nginx | head -1)

lsns -p $PAUSE_PID
#   NS TYPE   NPROCS    PID USER COMMAND
# 4026532763 mnt    2 176417 root unshare --net --ipc --uts --pid --mount --fork /bin/bash
# 4026532765 uts    5 176417 root unshare --net --ipc --uts --pid --mount --fork /bin/bash
# 4026532766 ipc    5 176417 root unshare --net --ipc --uts --pid --mount --fork /bin/bash
# 4026532767 pid    1 176418 root \`-/pause
# 4026532768 net    5 176417 root unshare --net --ipc --uts --pid --mount --fork /bin/bash

lsns -p $NGINX_PID
#   NS TYPE   NPROCS    PID USER COMMAND
# 4026532765 uts    5 176417 root unshare --net --ipc --uts --pid --mount --fork /bin/bash  ← mismo que pause
# 4026532766 ipc    5 176417 root unshare --net --ipc --uts --pid --mount --fork /bin/bash  ← mismo que pause
# 4026532768 net    6 176417 root unshare --net --ipc --uts --pid --mount --fork /bin/bash  ← mismo que pause
# 4026532825 mnt    3 188788 root unshare --pid --mount --fork /bin/bash                   ← propio
# 4026532826 pid    2 188789 root \`-nginx: master process /usr/sbin/nginx -g daemon off;   ← propio</code></pre>

          <p>nginx escucha en el puerto 80 del namespace de red del pause. Para accederlo hay que entrar al namespace con <code>nsenter</code> — y levantar el loopback, que en un namespace nuevo arranca en estado DOWN:</p>

          <pre><code>nsenter --net=/proc/$PAUSE_PID/ns/net -- ss -tlnp
# LISTEN 0  511  0.0.0.0:80  users:(("nginx",pid=189391,...))

nsenter --net=/proc/$PAUSE_PID/ns/net -- ip link set lo up

nsenter --net=/proc/$PAUSE_PID/ns/net -- curl -s localhost | head -4
# &lt;!DOCTYPE html&gt;
# &lt;html&gt;
# &lt;head&gt;
# &lt;title&gt;Welcome to nginx!&lt;/title&gt;</code></pre>

          <p>Esto es exactamente lo que hace containerd cuando kubelet llama <code>RunPodSandbox</code> (pause + namespaces) y luego <code>CreateContainer</code> (nginx entrando al sandbox). La diferencia es que containerd también ejecuta el plugin CNI para asignar una IP real al namespace de red — en nuestro caso la interfaz solo tiene loopback.</p>
        `,
  en: `
          <p>So far we have seen what Kubernetes does when it creates a Pod. In this section we will replicate that process manually — extracting rootfs from images, creating the sandbox with <a href="/tutorial/que-es-realmente-un-contenedor/namespaces"><code>unshare</code></a> and <a href="/tutorial/que-es-realmente-un-contenedor/chroot-pivot-root"><code>pivot_root</code></a>, and joining nginx to the same sandbox. No kubelet, no containerd, no <code>docker run</code>. Just Linux kernel calls.</p>

          <p>This is the natural extension of what we did in <a href="/tutorial/que-es-realmente-un-contenedor/construyendo-un-contenedor">building a container from scratch</a>: there we assembled a container with its own namespaces; here we assemble <em>two rootfs</em> sharing net/ipc/uts thanks to <code>setns()</code>.</p>

          <h2>Prepare directories and images</h2>

          <pre><code>mkdir -p /tmp/pod-demo/{pause-img,nginx-img,pause-layers/layer0,pause-overlay/{upper,work,merged}}

docker pull registry.k8s.io/pause:3.9
docker pull nginx:alpine

docker save registry.k8s.io/pause:3.9 -o /tmp/pod-demo/pause.tar
docker save nginx:alpine             -o /tmp/pod-demo/nginx.tar

tar -xf /tmp/pod-demo/pause.tar -C /tmp/pod-demo/pause-img
tar -xf /tmp/pod-demo/nginx.tar -C /tmp/pod-demo/nginx-img</code></pre>

          <h2>Extract layers and mount OverlayFS</h2>

          <p>The <code>manifest.json</code> inside each tarball describes the layers that make up the image and the order they must be applied. pause has a single layer — the static binary. nginx:alpine has eight layers, one per <code>RUN</code> instruction in the Dockerfile.</p>

          <pre><code># pause: one layer → extract directly to layer0
jq -r '.[0].Layers[]' /tmp/pod-demo/pause-img/manifest.json | while read layer; do
  tar -xf "/tmp/pod-demo/pause-img/$layer" -C /tmp/pod-demo/pause-layers/layer0 2>/dev/null || true
done

cat /tmp/pod-demo/pause-img/manifest.json | jq -r '.[0].Layers[]'
# blobs/sha256/e3e5579...   ← single layer

cat /tmp/pod-demo/nginx-img/manifest.json | jq -r '.[0].Layers[]'
# blobs/sha256/989e799...
# blobs/sha256/6e27cbd...
# blobs/sha256/bdb037c...   ← eight layers</code></pre>

          <p>pause does not need OverlayFS — a single layer has nothing to stack. But it does need a mount point for <code>pivot_root</code>, so we mount it anyway:</p>

          <pre><code># pause: mount overlay (to have a mount point for pivot_root)
sudo mount -t overlay overlay \
  -o "lowerdir=/tmp/pod-demo/pause-layers/layer0,upperdir=/tmp/pod-demo/pause-overlay/upper,workdir=/tmp/pod-demo/pause-overlay/work" \
  /tmp/pod-demo/pause-overlay/merged</code></pre>

          <p>For nginx, each layer goes into its own directory. OverlayFS stacks them in reverse order — the most recent layer has the highest priority:</p>

          <pre><code># nginx: extract each layer into its own directory
mapfile -t LAYERS < <(jq -r '.[0].Layers[]' /tmp/pod-demo/nginx-img/manifest.json)
for i in "\${!LAYERS[@]}"; do
  mkdir -p "/tmp/pod-demo/nginx-layers/layer$i"
  tar -xf "/tmp/pod-demo/nginx-img/\${LAYERS[$i]}" -C "/tmp/pod-demo/nginx-layers/layer$i" 2>/dev/null || true
done

# build lowerdir in reverse order (most recent layer first)
NLAYERS=\${#LAYERS[@]}
LOWERDIRS=""
for ((i=NLAYERS-1; i>=0; i--)); do
  [ -n "$LOWERDIRS" ] && LOWERDIRS="$LOWERDIRS:"
  LOWERDIRS="\${LOWERDIRS}/tmp/pod-demo/nginx-layers/layer$i"
done

mkdir -p /tmp/pod-demo/nginx-overlay/{upper,work,merged}
sudo mount -t overlay overlay \
  -o "lowerdir=$LOWERDIRS,upperdir=/tmp/pod-demo/nginx-overlay/upper,workdir=/tmp/pod-demo/nginx-overlay/work" \
  /tmp/pod-demo/nginx-overlay/merged

ls /tmp/pod-demo/pause-overlay/merged/   # → pause
ls /tmp/pod-demo/nginx-overlay/merged/   # → bin  dev  etc  ...</code></pre>

          <h2>Terminal 1 — Create the sandbox (pause)</h2>

          <p><code>unshare</code> creates the new namespaces. We open a bash shell inside the new environment to mount <code>/proc</code> before calling <code>pivot_root</code> — once the root is changed, the pause rootfs only has the <code>/pause</code> binary and no host tools are available:</p>

          <pre><code>sudo unshare --net --ipc --uts --pid --mount --fork /bin/bash

# Still on the host filesystem — mount proc before pivot_root
mkdir -p /tmp/pod-demo/pause-overlay/merged/proc
mount -t proc proc /tmp/pod-demo/pause-overlay/merged/proc

cd /tmp/pod-demo/pause-overlay/merged
mkdir -p .old-root
pivot_root . .old-root
umount -l /.old-root
rmdir /.old-root
exec /pause
# (blocks waiting for signals — exactly its purpose)</code></pre>

          <h2>Terminal 2 — Join nginx to the sandbox</h2>

          <p>With pause running, we find its PID on the host. Since this environment has several pause processes (Kubernetes uses them too), we use <code>-n</code> to get the most recent one:</p>

          <pre><code>PAUSE_PID=$(pgrep -xn pause)
echo $PAUSE_PID
# 176418

ls -la /proc/$PAUSE_PID/ns/
# ipc -> ipc:[4026532766]
# mnt -> mnt:[4026532763]
# net -> net:[4026532768]
# pid -> pid:[4026532767]
# uts -> uts:[4026532765]</code></pre>

          <p><code>nsenter</code> enters the pause's net, IPC, and UTS namespaces. <code>unshare</code> creates new pid and mnt namespaces for nginx. Just like pause, we mount <code>/proc</code> before <code>pivot_root</code>:</p>

          <pre><code>nsenter --net=/proc/$PAUSE_PID/ns/net \
        --ipc=/proc/$PAUSE_PID/ns/ipc \
        --uts=/proc/$PAUSE_PID/ns/uts \
  unshare --pid --mount --fork /bin/bash

mount -t proc proc /tmp/pod-demo/nginx-overlay/merged/proc
cd /tmp/pod-demo/nginx-overlay/merged
mkdir -p .old-root
pivot_root . .old-root
umount -l /.old-root
rmdir /.old-root
exec /usr/sbin/nginx -g "daemon off;"</code></pre>

          <h2>Terminal 3 — Inspect from the host</h2>

          <pre><code>PAUSE_PID=$(pgrep -xn pause)
NGINX_PID=$(pgrep -x nginx | head -1)

lsns -p $PAUSE_PID
#   NS TYPE   NPROCS    PID USER COMMAND
# 4026532763 mnt    2 176417 root unshare --net --ipc --uts --pid --mount --fork /bin/bash
# 4026532765 uts    5 176417 root unshare --net --ipc --uts --pid --mount --fork /bin/bash
# 4026532766 ipc    5 176417 root unshare --net --ipc --uts --pid --mount --fork /bin/bash
# 4026532767 pid    1 176418 root \`-/pause
# 4026532768 net    5 176417 root unshare --net --ipc --uts --pid --mount --fork /bin/bash

lsns -p $NGINX_PID
#   NS TYPE   NPROCS    PID USER COMMAND
# 4026532765 uts    5 176417 root unshare --net --ipc --uts --pid --mount --fork /bin/bash  ← same as pause
# 4026532766 ipc    5 176417 root unshare --net --ipc --uts --pid --mount --fork /bin/bash  ← same as pause
# 4026532768 net    6 176417 root unshare --net --ipc --uts --pid --mount --fork /bin/bash  ← same as pause
# 4026532825 mnt    3 188788 root unshare --pid --mount --fork /bin/bash                   ← own
# 4026532826 pid    2 188789 root \`-nginx: master process /usr/sbin/nginx -g daemon off;   ← own</code></pre>

          <p>nginx is listening on port 80 of the pause's network namespace. To reach it we enter the namespace with <code>nsenter</code> — and bring up the loopback interface, which starts DOWN in a new network namespace:</p>

          <pre><code>nsenter --net=/proc/$PAUSE_PID/ns/net -- ss -tlnp
# LISTEN 0  511  0.0.0.0:80  users:(("nginx",pid=189391,...))

nsenter --net=/proc/$PAUSE_PID/ns/net -- ip link set lo up

nsenter --net=/proc/$PAUSE_PID/ns/net -- curl -s localhost | head -4
# &lt;!DOCTYPE html&gt;
# &lt;html&gt;
# &lt;head&gt;
# &lt;title&gt;Welcome to nginx!&lt;/title&gt;</code></pre>

          <p>This is exactly what containerd does when kubelet calls <code>RunPodSandbox</code> (pause + namespaces) and then <code>CreateContainer</code> (nginx joining the sandbox). The difference is that containerd also runs the CNI plugin to assign a real IP to the network namespace — in our case the interface only has loopback.</p>
        `,
}
