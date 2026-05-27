export default {
  es: `
          <p>Tenemos todas las piezas: namespaces, capabilities, pivot_root, OverlayFS, cgroups. Es hora de armarlas. Vamos a construir un contenedor funcional sin Docker, usando solo herramientas del kernel.</p>

          <h2>Paso 1: preparar el rootfs</h2>

          <p>Necesitamos un filesystem raíz. Usamos Alpine porque es mínimo:</p>

          <pre><code># Exportar el rootfs de Alpine desde una imagen Docker
mkdir -p /tmp/mycontainer/rootfs
docker export $(docker create alpine) | tar -xC /tmp/mycontainer/rootfs

ls /tmp/mycontainer/rootfs
# bin  dev  etc  home  lib  media  mnt  opt  proc  root  run  sbin  srv  sys  tmp  usr  var</code></pre>

          <h2>Paso 2: crear los namespaces con unshare</h2>

          <p><code>unshare</code> invoca la syscall del mismo nombre. Cada flag crea un namespace del tipo correspondiente:</p>

          <pre><code>sudo unshare \\
  --pid \\        # Nuevo namespace de PID
  --fork \\       # Fork necesario para que PID 1 sea el proceso hijo
  --uts \\        # Nuevo namespace de hostname
  --ipc \\        # Nuevo namespace de IPC
  --net \\        # Nuevo namespace de red
  --mount-proc=/tmp/mycontainer/rootfs/proc \\  # /proc fresco + mount namespace implícito
  /bin/bash</code></pre>

          <p>Desde aquí, estamos dentro de los namespaces pero todavía con el filesystem del host.</p>

          <h2>Paso 3: pivot_root al rootfs del contenedor</h2>

          <pre><code># Dentro del unshare:

# Hacer privada la propagación del árbol actual: pivot_root lo requiere.
# Si lo omites, el siguiente pivot_root falla con EINVAL en muchas distros.
mount --make-rprivate /

# Montar el rootfs como bind mount (necesario para pivot_root)
mount --bind /tmp/mycontainer/rootfs /tmp/mycontainer/rootfs
cd /tmp/mycontainer/rootfs

# Crear el directorio para el viejo root
mkdir -p .old_root

# Intercambiar el root
pivot_root . .old_root
cd /

# Desmontar el filesystem del host
umount -l /.old_root
rmdir /.old_root

# Verificar: ahora solo vemos Alpine
ls /
cat /etc/os-release | head -2
# NAME="Alpine Linux"</code></pre>

          <h2>Paso 4: montar los filesystems virtuales</h2>

          <pre><code># proc: necesario para ps, /proc/self, etc.
mount -t proc proc /proc

# devtmpfs: dispositivos básicos
mount -t devtmpfs dev /dev

# tmpfs: /tmp y /run
mount -t tmpfs tmpfs /tmp
mount -t tmpfs tmpfs /run

# Verificar procesos: solo vemos los del nuevo namespace
ps aux
# PID   USER     TIME  COMMAND
#     1 root      0:00 /bin/bash
#    12 root      0:00 ps aux</code></pre>

          <h2>Paso 5: configurar hostname y red básica</h2>

          <pre><code># Hostname propio (namespace UTS)
hostname mi-contenedor
hostname
# mi-contenedor

# La interfaz loopback está ahí pero down
ip addr
# 1: lo: &lt;LOOPBACK&gt; ...

# Levantar loopback
ip link set lo up
ip addr show lo
# 1: lo: &lt;LOOPBACK,UP&gt; ...</code></pre>

          <div class="callout callout-note">
            <span class="callout-label">Sin conectividad externa</span>
            <p>Tu contenedor solo tiene <code>lo</code> levantada; no hay salida a internet. <code>nslookup</code>, <code>apk add</code> o cualquier <code>curl</code> fallará con <code>Network unreachable</code> o timeouts de DNS. Esto es esperado: para dar conectividad hay que crear un <a href="/tutorial/que-es-realmente-un-contenedor/namespaces#5-net-network-namespace">veth pair</a> entre el network namespace del contenedor y el host, agregar el extremo del host a un bridge (p. ej. <code>docker0</code>), asignar una IP, configurar default route dentro del namespace, y opcionalmente reglas NAT en <code>iptables</code>. Todo eso lo hace Docker por ti; acá lo dejamos fuera del scope para mantener el ejemplo enfocado. Si necesitas instalar paquetes dentro, hazlo <em>antes</em> de entrar al namespace (con <code>chroot /tmp/mycontainer/rootfs apk add ...</code>).</p>
          </div>

          <h2>Paso 6: aplicar límites de recursos con cgroups</h2>

          <p>Desde otra terminal del host (el cgroup se aplica desde fuera):</p>

          <pre><code># OJO: con --fork, unshare hace fork() y el HIJO ejecuta bash dentro de los
# namespaces nuevos. El proceso "unshare" padre se queda esperando en el
# namespace original — meterlo al cgroup no limita al contenedor.
# Lo que queremos es el PID del bash hijo.

# -n (newest) evita que pgrep -f matchee los wrappers de sudo — al correr
#   'sudo unshare ...' suelen aparecer 2-3 PIDs con 'unshare' en la cmdline.
#   El más nuevo siempre es el propio binario unshare.
UNSHARE_PID=$(pgrep -n -f "unshare.*mount-proc")
CONTAINER_PID=$(pgrep -P \${UNSHARE_PID})    # hijo directo del unshare = el bash

# Verificar (debería estar en un PID namespace distinto al del host)
readlink /proc/\${CONTAINER_PID}/ns/pid
readlink /proc/1/ns/pid                      # distintos → está aislado

# Crear el cgroup
mkdir /sys/fs/cgroup/mi-contenedor

# Límites
echo $((256 * 1024 * 1024)) > /sys/fs/cgroup/mi-contenedor/memory.max
echo "50000 100000" > /sys/fs/cgroup/mi-contenedor/cpu.max
echo 100 > /sys/fs/cgroup/mi-contenedor/pids.max

# Agregar el proceso del contenedor
echo \${CONTAINER_PID} > /sys/fs/cgroup/mi-contenedor/cgroup.procs</code></pre>

          <h2>Paso 7: validar el aislamiento</h2>

          <p>Antes de declarar victoria, tres pruebas que reusan lo que construimos en capítulos anteriores.</p>

          <h3>7.1 — pivot_root resiste el escape de chroot</h3>

          <p>Copia el <code>escape</code> compilado en la <a href="/tutorial/que-es-realmente-un-contenedor/chroot-pivot-root">parte 4</a> al rootfs del contenedor (desde el host, antes de entrar al unshare):</p>

          <pre><code># En el host (antes del unshare)
cp /tmp/rootfs/escape /tmp/mycontainer/rootfs/escape

# Dentro del contenedor manual (tras pivot_root + umount del viejo root)
./escape
cat /etc/os-release | head -1
# PRETTY_NAME="Alpine Linux v3.23"   ← sigue siendo Alpine, el escape falló</code></pre>

          <p>El mismo binario que en la parte 4 te sacó de un <code>chroot</code> hacia Ubuntu aquí queda atrapado en Alpine. Razón: <code>pivot_root</code> + <code>umount -l /.old_root</code> eliminó la tabla de montajes del host, y el exploit de <code>chroot</code> no tiene "fuera" al que llegar.</p>

          <h3>7.2 — Las capabilities dentro del contenedor</h3>

          <p>En tu contenedor manual, <code>unshare</code> no dropeó capabilities. Resultado: siendo UID 0 dentro, tienes TODAS las capabilities del host, a diferencia del subconjunto reducido que Docker aplica (<a href="/tutorial/que-es-realmente-un-contenedor/capabilities">ver parte 3</a>):</p>

          <pre><code># Dentro del contenedor (tty A)
cat /proc/self/status | grep Cap
# CapInh: 0000000000000000
# CapPrm: 000001ffffffffff   ← todas las 41 capabilities disponibles
# CapEff: 000001ffffffffff
# CapBnd: 000001ffffffffff
# CapAmb: 0000000000000000</code></pre>

          <p>Alpine no incluye <code>capsh</code> — y como ya vimos, sin conectividad tampoco podemos instalarlo desde dentro. Por suerte la conversión hex→nombres es cálculo local y no toca al proceso, así que basta con usar el <code>capsh</code> del host (paquete <code>libcap2-bin</code> en Ubuntu/Debian) desde otra terminal:</p>

          <pre><code># En otra terminal del host
capsh --decode=000001ffffffffff
# 0x000001ffffffffff=cap_chown,cap_dac_override,cap_dac_read_search,cap_fowner,
# cap_fsetid,cap_kill,cap_setgid,cap_setuid,cap_setpcap,cap_linux_immutable,
# cap_net_bind_service,cap_net_broadcast,cap_net_admin,cap_net_raw,cap_ipc_lock,
# cap_ipc_owner,cap_sys_module,cap_sys_rawio,cap_sys_chroot,cap_sys_ptrace,
# cap_sys_pacct,cap_sys_admin,cap_sys_boot,cap_sys_nice,cap_sys_resource,
# cap_sys_time,cap_sys_tty_config,cap_mknod,cap_lease,cap_audit_write,
# cap_audit_control,cap_setfcap,cap_mac_override,cap_mac_admin,cap_syslog,
# cap_wake_alarm,cap_block_suspend,cap_audit_read,cap_perfmon,cap_bpf,
# cap_checkpoint_restore
#
# Incluye CAP_SYS_ADMIN, CAP_SYS_MODULE, CAP_SYS_PTRACE, CAP_NET_ADMIN —
# todo lo que Docker dropea de su set por defecto.</code></pre>

          <p>Esto es lo que hace que nuestro contenedor sea <em>funcional pero no seguro</em> como defensa. Un runtime OCI (runc) usa <code>prctl(PR_CAPBSET_DROP, ...)</code> después del <code>pivot_root</code> para restringirlo al bounding set del <code>config.json</code>. Lo omitimos aquí por simplicidad, pero sabiendo que falta.</p>

          <h3>7.3 — Los límites del cgroup funcionan y lo puedes pausar</h3>

          <p>Desde la terminal del host (con <code>CONTAINER_PID</code> del paso 6), confirma que <code>cgroup.freeze</code> pausa a tu contenedor manual igual que a cualquier container de Docker:</p>

          <pre><code># Dentro del contenedor (tty A): arranca un contador
i=0; while true; do i=$((i+1)); echo "tick $i $(date +%T)"; sleep 1; done
# tick 1 11:48:51
# tick 2 11:48:52
# ...
# tick 13 11:49:03

# En el host (tty B): congelar
echo 1 > /sys/fs/cgroup/mi-contenedor/cgroup.freeze
cat /sys/fs/cgroup/mi-contenedor/cgroup.events
# populated 1
# frozen 1            ← confirmado

# Esperar ~30s y descongelar
echo 0 > /sys/fs/cgroup/mi-contenedor/cgroup.freeze

# Volver al tty A: los ticks resumen con un salto en el timestamp
# tick 13 11:49:03
# tick 14 11:49:31    ← 28 segundos de gap por el freeze</code></pre>

          <p>Es exactamente la misma primitiva que demostramos en la <a href="/tutorial/que-es-realmente-un-contenedor/cgroups">parte 6</a> para contenedores Docker — la estás aplicando tú a un cgroup que tú creaste, sobre un proceso que tú moviste dentro.</p>

          <h2>Paso 8: limpiar</h2>

          <p>Salir del contenedor manual es solo <code>exit</code> (se acaba el bash que era PID 1, el kernel libera los namespaces). Pero el cgroup y los mounts persisten — conviene limpiarlos:</p>

          <pre><code># Dentro del contenedor
exit                     # sale del bash PID 1

# En el host, limpiar el cgroup (solo se puede si ya no tiene procesos)
rmdir /sys/fs/cgroup/mi-contenedor

# Opcional: limpiar el rootfs exportado
rm -rf /tmp/mycontainer</code></pre>

          <p>Los namespaces desaparecen automáticamente cuando no quedan ni procesos dentro ni FDs abiertos hacia <code>/proc/&lt;pid&gt;/ns/*</code>. Los mounts que creamos dentro del namespace (<code>/proc</code>, <code>/dev</code>, <code>/tmp</code>, <code>/run</code>) se desmontaron junto con el mount namespace al salir.</p>

          <h2>Paso 9 (opcional): rootfs con OverlayFS</h2>

          <p>Hasta aquí el contenedor usa un bind mount plano del rootfs: cualquier escritura modifica <code>/tmp/mycontainer/rootfs</code> directamente. Un runtime real no hace esto — usa <a href="/tutorial/que-es-realmente-un-contenedor/overlayfs">OverlayFS</a> para que la imagen base quede inmutable y los cambios vivan en una capa separada. Así múltiples contenedores pueden compartir la misma imagen sin interferir.</p>

          <p>Sustituye el bind mount del Paso 3 por un overlay:</p>

          <pre><code># Fuera del unshare, preparar las 4 capas
mkdir -p /tmp/mycontainer/{lower,upper,work,merged}
docker export $(docker create alpine) | tar -xC /tmp/mycontainer/lower

# lower: imagen base (read-only desde la perspectiva del contenedor)
# upper: capa de escritura exclusiva del contenedor
# work:  directorio auxiliar interno de OverlayFS
# merged: el punto de montaje que el contenedor verá como /

# Entrar al unshare (como antes)
sudo unshare --pid --fork --uts --ipc --net \\
  --mount-proc=/tmp/mycontainer/merged/proc /bin/bash

# Dentro: montar el overlay y pivot_root sobre merged
mount --make-rprivate /
mount -t overlay overlay \\
  -o lowerdir=/tmp/mycontainer/lower,\\
     upperdir=/tmp/mycontainer/upper,\\
     workdir=/tmp/mycontainer/work \\
  /tmp/mycontainer/merged

cd /tmp/mycontainer/merged
mkdir -p .old_root
pivot_root . .old_root
cd /
umount -l /.old_root
rmdir /.old_root
mount -t proc proc /proc</code></pre>

          <p>Ahora cualquier escritura dentro del contenedor se materializa en <code>/tmp/mycontainer/upper/</code> — <code>lower/</code> queda intacto:</p>

          <pre><code># Dentro del contenedor
echo "hello from container" > /test.txt

# En otra terminal del host
ls /tmp/mycontainer/upper/
# test.txt                      ← el archivo nuevo aparece SOLO en upper
cat /tmp/mycontainer/upper/test.txt
# hello from container

ls /tmp/mycontainer/lower/      # la imagen base no cambió
# bin dev etc home lib ...      ← sin test.txt</code></pre>

          <p>Para correr un segundo contenedor con la misma imagen base, solo necesitas otro <code>upper/</code> + <code>work/</code> + <code>merged/</code> — <code>lower/</code> se comparte. Esto es exactamente cómo Docker gestiona cientos de contenedores desde una sola pull de <code>nginx:alpine</code>.</p>

          <h2>Paso 10 (opcional): hacerlo rootless con user namespace</h2>

          <p>Hasta ahora todo el contenedor requiere <code>sudo</code>. Agregando el <a href="/tutorial/que-es-realmente-un-contenedor/namespaces#6-user-user-namespace">user namespace</a> puedes correr el unshare completo como <strong>usuario normal</strong> — sin <code>sudo</code>. Tendrás UID 0 dentro, mapeado a tu UID real del host, que es la base técnica de Docker rootless y Podman.</p>

          <p>Esta sección se ejecuta de forma independiente: no asume que ya hiciste los pasos anteriores. Empieza creando el rootfs y un usuario sin privilegios.</p>

          <div class="callout callout-warning">
            <span class="callout-label">Antes de empezar — Ubuntu 24.04+</span>
            <p>Desde Ubuntu 24.04, AppArmor bloquea por default que usuarios sin privilegios creen user namespaces. Si el <code>unshare</code> de más abajo falla con <code>write failed /proc/self/uid_map: Operation not permitted</code>, este sysctl es la causa:</p>
            <pre><code>sysctl kernel.apparmor_restrict_unprivileged_userns
# kernel.apparmor_restrict_unprivileged_userns = 1   ← bloquea

sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
# Permanente: agregar la línea a /etc/sysctl.d/99-unpriv-userns.conf</code></pre>
            <p>Tradeoff: bajar este flag quita una capa de defense-in-depth — vulnerabilidades del kernel que requieran un user namespace nuevo se vuelven explotables por usuarios sin privilegios. Para una máquina de pruebas no es problema; en producción lo correcto es escribir un perfil AppArmor que permita el binario específico.</p>
          </div>

          <p><strong>Setup como root</strong> — preparar el rootfs y un usuario sin privilegios. El paso del <code>chown</code> es <em>crítico</em>: con <code>--map-root-user</code> solo se mapea un UID (0 ↔ 1001). Los archivos del rootfs los creó root (UID 0 del host), y desde adentro del namespace ese UID 0 del host no está mapeado, así que aparecen como <code>nobody</code>/overflow. El "root" del namespace no puede escribirles. Pasarle ownership a <code>myuser</code> antes de empezar resuelve eso.</p>

          <pre><code># Como root del host
mkdir -p /tmp/mycontainer/rootfs
docker export $(docker create alpine) | tar -xC /tmp/mycontainer/rootfs

# Usuario sin privilegios
useradd -m -u 1001 -s /bin/bash myuser
echo 'myuser:12345' | chpasswd

# El usuario debe ser dueño del rootfs para que pueda escribirle
# desde el user namespace donde su UID 0 mapea a 1001 del host
chown -R 1001:1001 /tmp/mycontainer</code></pre>

          <p><strong>Como <code>myuser</code></strong> — entrar al user namespace y armar el contenedor. El <code>--mount</code> es redundante porque <code>--mount-proc</code> ya lo implica:</p>

          <pre><code>su - myuser

# OJO con la ruta de --mount-proc: usa ABSOLUTA y que coincida con donde
# va a quedar /proc después del pivot_root. Una ruta relativa se resuelve
# contra tu cwd, queda fuera del nuevo root, y desaparece con el umount
# de /.old_root.
unshare --user --map-root-user \\
        --pid --fork --uts --ipc --net \\
        --mount-proc=/tmp/mycontainer/rootfs/proc \\
        /bin/bash

# Dentro: eres "root" en el user namespace
id
# uid=0(root) gid=0(root)

# Pero el mapeo muestra que "root" = tu UID real del host
cat /proc/self/uid_map
# 0  1001  1          ← UID 0 interno = UID 1001 externo

# Las demás operaciones (mount, pivot_root, etc.) funcionan igual
# porque tienes CAP_SYS_ADMIN dentro del user namespace.
mount --make-rprivate /

# OJO: --rbind, no --bind. --mount-proc ya montó procfs en
# /tmp/mycontainer/rootfs/proc; un bind no recursivo crearía un nuevo
# punto de montaje encima de esa ruta y taparía el procfs (verías el
# directorio /proc vacío del tarball de Alpine, y ps no listaría nada).
# --rbind preserva los sub-mounts a través del pivot_root.
mount --rbind /tmp/mycontainer/rootfs /tmp/mycontainer/rootfs
cd /tmp/mycontainer/rootfs &amp;&amp; mkdir -p .old_root
pivot_root . .old_root
cd / &amp;&amp; umount -l /.old_root &amp;&amp; rmdir /.old_root
hash -r                       # limpia el cache de comandos del shell

# /proc YA está montado (preservado por --rbind): --mount-proc lo dejó en
# /tmp/mycontainer/rootfs/proc, que después del pivot_root es /proc.
# NO intentes 'mount -t proc proc /proc' acá — falla con EPERM porque
# montar un proc nuevo en un user namespace requiere un proc "linaje"
# del mismo user+pid namespace ya visible, y después del umount del viejo
# root no queda ninguno alcanzable.
ls /proc | head -3            # 1  16  17   ← solo el bash y sus hijos
mount -t tmpfs tmpfs /tmp     # tmpfs sí se puede montar siempre</code></pre>

          <p>Punto conceptual clave: el "root" que ves dentro del namespace es root <em>para las operaciones que viven dentro de este user namespace</em>. Tienes <code>CAP_SYS_ADMIN</code>, puedes <code>mount</code>, puedes <code>chmod</code> archivos creados por procesos del namespace. Pero el kernel sigue evaluándote como UID 1001 cuando intentas algo que cruza el límite — tocar archivos del host cuyo dueño es un UID no mapeado, enviar señales a procesos fuera de tu PID namespace, llamar syscalls que requieren caps en el user namespace inicial. Es la misma idea que vimos en <a href="/tutorial/que-es-realmente-un-contenedor/capabilities#por-que-root-en-un-contenedor-sigue-siendo-peligroso">por qué root en un contenedor sigue siendo peligroso</a>, pero ahora con una barrera real: el mapeo del kernel hace que las dos perspectivas (la del namespace y la del host) sean distintas para todo lo que importe.</p>

          <div class="callout callout-note">
            <span class="callout-label">Limitaciones del modo rootless</span>
            <p>No todas las operaciones del Paso 4 funcionan. <code>mount -t devtmpfs dev /dev</code> <strong>falla</strong> porque requiere CAP_SYS_ADMIN en el user namespace <em>inicial</em>, no el tuyo derivado. Workaround práctico: usar <code>mount -t tmpfs tmpfs /dev</code> y <code>mknod</code> los pocos devices que necesitas (también limitado), o bind-mount selectivo de <code>/dev/null</code>, <code>/dev/zero</code>, etc. desde el host.</p>
            <p>OverlayFS sobre user namespace <em>sí</em> funciona desde kernel 5.11+ (<a href="https://docs.kernel.org/filesystems/overlayfs.html#user-xattr" target="_blank" rel="noopener">unprivileged overlay</a>). Si estás en un kernel más viejo, necesitarás FUSE-overlayfs — exactamente lo que usa Podman en esos casos.</p>
          </div>

          <p>Verifica el aislamiento de privilegio desde otra terminal del host:</p>

          <pre><code># Desde fuera (terminal del host, sin sudo)
BASH_PID=$(pgrep -f 'unshare.*mount-proc' | xargs -I{} pgrep -P {})

# El bash dentro del contenedor rootless corre con TU UID real
ps -o pid,uid,user,comm -p \${BASH_PID}
# PID   UID USER     COMMAND
# 1234 1001 ubuntu   bash                ← UID 1001 del host
#                                         (aunque dentro dice "root")</code></pre>

          <p>Si ese proceso escapa del contenedor (fuga del runtime, vulnerabilidad del kernel), aterriza en el host como <strong>ubuntu</strong>, no como <strong>root</strong>. El daño que puede hacer está limitado a lo que tu usuario normal puede hacer. Es la diferencia entre "un bug = tu CI comprometido" y "un bug = tu servidor comprometido".</p>

          <h2>Resultado final</h2>

          <pre><code># Dentro del contenedor manual:
ps aux         # Solo bash y ps (PID namespace aislado)
hostname       # mi-contenedor (UTS namespace)
ip addr        # Solo loopback (net namespace)
ls /           # Alpine (pivot_root efectivo)
cat /proc/1/cgroup  # Apunta al cgroup que creamos</code></pre>

          <p>Esto es exactamente lo que hace un runtime de contenedores, con algunas diferencias:</p>
          <ul>
            <li>Los runtimes leen la configuración desde un bundle OCI (<code>config.json</code>), no de flags.</li>
            <li>Usan seccomp para filtrar syscalls peligrosas (nosotros no lo cubrimos aquí).</li>
            <li>Aplican perfiles de AppArmor o SELinux como capa adicional.</li>
            <li>Configuran el veth pair y lo conectan a un bridge antes de entrar al namespace de red.</li>
          </ul>

          <p>Pero la estructura es idéntica. Lo que acabas de construir <em>es</em> un contenedor.</p>
        `,
  en: `
          <p>We have all the pieces: namespaces, capabilities, pivot_root, OverlayFS, cgroups. It is time to assemble them. We are going to build a functional container without Docker, using only kernel tools.</p>

          <h2>Step 1: prepare the rootfs</h2>

          <p>We need a root filesystem. We use Alpine because it is minimal:</p>

          <pre><code># Export the Alpine rootfs from a Docker image
mkdir -p /tmp/mycontainer/rootfs
docker export $(docker create alpine) | tar -xC /tmp/mycontainer/rootfs

ls /tmp/mycontainer/rootfs
# bin  dev  etc  home  lib  media  mnt  opt  proc  root  run  sbin  srv  sys  tmp  usr  var</code></pre>

          <h2>Step 2: create namespaces with unshare</h2>

          <p><code>unshare</code> invokes the syscall of the same name. Each flag creates a namespace of the corresponding type:</p>

          <pre><code>sudo unshare \\
  --pid \\        # New PID namespace
  --fork \\       # Fork required so PID 1 is the child process
  --uts \\        # New hostname namespace
  --ipc \\        # New IPC namespace
  --net \\        # New network namespace
  --mount-proc=/tmp/mycontainer/rootfs/proc \\  # Fresh /proc + implicit mount namespace
  /bin/bash</code></pre>

          <p>From here we are inside the namespaces but still using the host filesystem.</p>

          <h2>Step 3: pivot_root to the container rootfs</h2>

          <pre><code># Inside the unshare:

# Make the current tree's propagation private: pivot_root requires it.
# If you skip this, the following pivot_root fails with EINVAL on many distros.
mount --make-rprivate /

# Mount the rootfs as a bind mount (required for pivot_root)
mount --bind /tmp/mycontainer/rootfs /tmp/mycontainer/rootfs
cd /tmp/mycontainer/rootfs

# Create the directory for the old root
mkdir -p .old_root

# Swap the root
pivot_root . .old_root
cd /

# Unmount the host filesystem
umount -l /.old_root
rmdir /.old_root

# Verify: we now see only Alpine
ls /
cat /etc/os-release | head -2
# NAME="Alpine Linux"</code></pre>

          <h2>Step 4: mount virtual filesystems</h2>

          <pre><code># proc: required for ps, /proc/self, etc.
mount -t proc proc /proc

# devtmpfs: basic devices
mount -t devtmpfs dev /dev

# tmpfs: /tmp and /run
mount -t tmpfs tmpfs /tmp
mount -t tmpfs tmpfs /run

# Verify processes: we only see those in the new namespace
ps aux
# PID   USER     TIME  COMMAND
#     1 root      0:00 /bin/bash
#    12 root      0:00 ps aux</code></pre>

          <h2>Step 5: configure hostname and basic networking</h2>

          <pre><code># Own hostname (UTS namespace)
hostname my-container
hostname
# my-container

# The loopback interface is there but down
ip addr
# 1: lo: &lt;LOOPBACK&gt; ...

# Bring loopback up
ip link set lo up
ip addr show lo
# 1: lo: &lt;LOOPBACK,UP&gt; ...</code></pre>

          <div class="callout callout-note">
            <span class="callout-label">No external connectivity</span>
            <p>Your container only has <code>lo</code> up; there is no path to the internet. <code>nslookup</code>, <code>apk add</code>, or any <code>curl</code> will fail with <code>Network unreachable</code> or DNS timeouts. This is expected: to provide connectivity you have to create a <a href="/tutorial/que-es-realmente-un-contenedor/namespaces#5-net-network-namespace">veth pair</a> between the container's network namespace and the host, attach the host end to a bridge (e.g. <code>docker0</code>), assign an IP, configure a default route inside the namespace, and optionally set up <code>iptables</code> NAT rules. Docker does all of that for you; here we leave it out to keep the example focused. If you need to install packages inside, do it <em>before</em> entering the namespace (e.g. <code>chroot /tmp/mycontainer/rootfs apk add ...</code>).</p>
          </div>

          <h2>Step 6: apply resource limits with cgroups</h2>

          <p>From another terminal on the host (the cgroup is applied from outside):</p>

          <pre><code># WARNING: with --fork, unshare fork()s and the CHILD runs bash inside the
# new namespaces. The parent "unshare" process stays in the original
# namespace — putting it in the cgroup does not constrain the container.
# We want the child bash PID.

# -n (newest) keeps pgrep -f from also matching sudo wrappers — running
#   'sudo unshare ...' usually produces 2-3 PIDs with 'unshare' in cmdline.
#   The newest is always the unshare binary itself.
UNSHARE_PID=$(pgrep -n -f "unshare.*mount-proc")
CONTAINER_PID=$(pgrep -P \${UNSHARE_PID})    # direct child of unshare = the bash

# Verify (should be in a different PID namespace from the host)
readlink /proc/\${CONTAINER_PID}/ns/pid
readlink /proc/1/ns/pid                      # different → isolated

# Create the cgroup
mkdir /sys/fs/cgroup/my-container

# Limits
echo $((256 * 1024 * 1024)) > /sys/fs/cgroup/my-container/memory.max
echo "50000 100000" > /sys/fs/cgroup/my-container/cpu.max
echo 100 > /sys/fs/cgroup/my-container/pids.max

# Add the container process
echo \${CONTAINER_PID} > /sys/fs/cgroup/my-container/cgroup.procs</code></pre>

          <h2>Step 7: validate the isolation</h2>

          <p>Before declaring victory, three checks that reuse what we built in previous chapters.</p>

          <h3>7.1 — pivot_root resists the chroot escape</h3>

          <p>Copy the <code>escape</code> compiled in <a href="/tutorial/que-es-realmente-un-contenedor/chroot-pivot-root">Part 4</a> into the container's rootfs (on the host, before entering unshare):</p>

          <pre><code># On the host (before unshare)
cp /tmp/rootfs/escape /tmp/mycontainer/rootfs/escape

# Inside the manual container (after pivot_root + umount of the old root)
./escape
cat /etc/os-release | head -1
# PRETTY_NAME="Alpine Linux v3.23"   ← still Alpine, the escape failed</code></pre>

          <p>The same binary that broke out of a <code>chroot</code> into Ubuntu in Part 4 is trapped in Alpine here. Reason: <code>pivot_root</code> + <code>umount -l /.old_root</code> removed the host's mount table, and the <code>chroot</code>-based exploit has no "outside" to reach.</p>

          <h3>7.2 — Capabilities inside the container</h3>

          <p>In your manual container, <code>unshare</code> did not drop any capabilities. The result: as UID 0 inside, you hold ALL the host's capabilities, unlike the reduced subset Docker enforces (<a href="/tutorial/que-es-realmente-un-contenedor/capabilities">see Part 3</a>):</p>

          <pre><code># Inside the container (tty A)
cat /proc/self/status | grep Cap
# CapInh: 0000000000000000
# CapPrm: 000001ffffffffff   ← all 41 capabilities available
# CapEff: 000001ffffffffff
# CapBnd: 000001ffffffffff
# CapAmb: 0000000000000000</code></pre>

          <p>Alpine does not ship <code>capsh</code> — and as we just saw, without network access we cannot install it from inside either. Luckily the hex→names conversion is a local computation that does not touch the container's process, so we can use the host's <code>capsh</code> (package <code>libcap2-bin</code> on Ubuntu/Debian) from another terminal:</p>

          <pre><code># From another terminal on the host
capsh --decode=000001ffffffffff
# 0x000001ffffffffff=cap_chown,cap_dac_override,cap_dac_read_search,cap_fowner,
# cap_fsetid,cap_kill,cap_setgid,cap_setuid,cap_setpcap,cap_linux_immutable,
# cap_net_bind_service,cap_net_broadcast,cap_net_admin,cap_net_raw,cap_ipc_lock,
# cap_ipc_owner,cap_sys_module,cap_sys_rawio,cap_sys_chroot,cap_sys_ptrace,
# cap_sys_pacct,cap_sys_admin,cap_sys_boot,cap_sys_nice,cap_sys_resource,
# cap_sys_time,cap_sys_tty_config,cap_mknod,cap_lease,cap_audit_write,
# cap_audit_control,cap_setfcap,cap_mac_override,cap_mac_admin,cap_syslog,
# cap_wake_alarm,cap_block_suspend,cap_audit_read,cap_perfmon,cap_bpf,
# cap_checkpoint_restore
#
# Includes CAP_SYS_ADMIN, CAP_SYS_MODULE, CAP_SYS_PTRACE, CAP_NET_ADMIN —
# everything Docker drops from its default set.</code></pre>

          <p>This is what makes our container <em>functional but not secure as a defense</em>. An OCI runtime (runc) calls <code>prctl(PR_CAPBSET_DROP, ...)</code> after <code>pivot_root</code> to restrict to the bounding set from <code>config.json</code>. We omit this here for simplicity, but knowing it is missing.</p>

          <h3>7.3 — The cgroup limits work and you can pause it</h3>

          <p>From the host terminal (with <code>CONTAINER_PID</code> from Step 6), confirm that <code>cgroup.freeze</code> pauses your manual container just like any Docker container:</p>

          <pre><code># Inside the container (tty A): start a counter
i=0; while true; do i=$((i+1)); echo "tick $i $(date +%T)"; sleep 1; done
# tick 1 11:48:51
# tick 2 11:48:52
# ...
# tick 13 11:49:03

# On the host (tty B): freeze
echo 1 > /sys/fs/cgroup/my-container/cgroup.freeze
cat /sys/fs/cgroup/my-container/cgroup.events
# populated 1
# frozen 1            ← confirmed

# Wait ~30s and unfreeze
echo 0 > /sys/fs/cgroup/my-container/cgroup.freeze

# Back to tty A: ticks resume with a timestamp jump
# tick 13 11:49:03
# tick 14 11:49:31    ← 28-second gap from the freeze</code></pre>

          <p>This is exactly the same primitive we demonstrated in <a href="/tutorial/que-es-realmente-un-contenedor/cgroups">Part 6</a> for Docker containers — you are applying it to a cgroup you created yourself, over a process you moved in yourself.</p>

          <h2>Step 8: clean up</h2>

          <p>Leaving the manual container is just <code>exit</code> (the bash that was PID 1 ends, the kernel releases the namespaces). But the cgroup and mounts persist — worth cleaning them up:</p>

          <pre><code># Inside the container
exit                     # exit the PID 1 bash

# On the host, clean up the cgroup (only possible if it has no processes)
rmdir /sys/fs/cgroup/my-container

# Optional: clean up the exported rootfs
rm -rf /tmp/mycontainer</code></pre>

          <p>Namespaces vanish automatically when no processes remain inside them and no FDs remain open to <code>/proc/&lt;pid&gt;/ns/*</code>. The mounts we created inside the namespace (<code>/proc</code>, <code>/dev</code>, <code>/tmp</code>, <code>/run</code>) were unmounted along with the mount namespace when we exited.</p>

          <h2>Step 9 (optional): rootfs with OverlayFS</h2>

          <p>So far the container uses a plain bind mount of the rootfs: any write modifies <code>/tmp/mycontainer/rootfs</code> directly. A real runtime does not do this — it uses <a href="/tutorial/que-es-realmente-un-contenedor/overlayfs">OverlayFS</a> so the base image stays immutable and changes live in a separate layer. That lets multiple containers share the same image without interfering.</p>

          <p>Replace Step 3's bind mount with an overlay:</p>

          <pre><code># Outside the unshare, prepare the 4 layers
mkdir -p /tmp/mycontainer/{lower,upper,work,merged}
docker export $(docker create alpine) | tar -xC /tmp/mycontainer/lower

# lower: base image (read-only from the container's perspective)
# upper: container-exclusive writable layer
# work:  OverlayFS internal auxiliary directory
# merged: the mount point the container will see as /

# Enter the unshare (as before)
sudo unshare --pid --fork --uts --ipc --net \\
  --mount-proc=/tmp/mycontainer/merged/proc /bin/bash

# Inside: mount the overlay and pivot_root onto merged
mount --make-rprivate /
mount -t overlay overlay \\
  -o lowerdir=/tmp/mycontainer/lower,\\
     upperdir=/tmp/mycontainer/upper,\\
     workdir=/tmp/mycontainer/work \\
  /tmp/mycontainer/merged

cd /tmp/mycontainer/merged
mkdir -p .old_root
pivot_root . .old_root
cd /
umount -l /.old_root
rmdir /.old_root
mount -t proc proc /proc</code></pre>

          <p>Now any write inside the container materializes in <code>/tmp/mycontainer/upper/</code> — <code>lower/</code> stays untouched:</p>

          <pre><code># Inside the container
echo "hello from container" > /test.txt

# In another host terminal
ls /tmp/mycontainer/upper/
# test.txt                      ← the new file appears ONLY in upper
cat /tmp/mycontainer/upper/test.txt
# hello from container

ls /tmp/mycontainer/lower/      # the base image did not change
# bin dev etc home lib ...      ← no test.txt</code></pre>

          <p>To run a second container with the same base image, you only need another <code>upper/</code> + <code>work/</code> + <code>merged/</code> — <code>lower/</code> is shared. This is exactly how Docker manages hundreds of containers from a single pull of <code>nginx:alpine</code>.</p>

          <h2>Step 10 (optional): make it rootless with a user namespace</h2>

          <p>Until now the whole container needs <code>sudo</code>. Adding the <a href="/tutorial/que-es-realmente-un-contenedor/namespaces#6-user-user-namespace">user namespace</a> lets you run the entire unshare as a <strong>regular user</strong> — no <code>sudo</code>. You will be UID 0 inside, mapped to your real host UID, which is the technical foundation of Docker rootless and Podman.</p>

          <p>This section runs independently: it does not assume you ran the previous steps. Start by creating the rootfs and an unprivileged user.</p>

          <div class="callout callout-warning">
            <span class="callout-label">Before you start — Ubuntu 24.04+</span>
            <p>Since Ubuntu 24.04, AppArmor blocks unprivileged users from creating user namespaces by default. If the <code>unshare</code> below fails with <code>write failed /proc/self/uid_map: Operation not permitted</code>, that sysctl is the cause:</p>
            <pre><code>sysctl kernel.apparmor_restrict_unprivileged_userns
# kernel.apparmor_restrict_unprivileged_userns = 1   ← blocked

sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
# To make it persistent, add the line to /etc/sysctl.d/99-unpriv-userns.conf</code></pre>
            <p>Trade-off: lowering this flag removes a defense-in-depth layer — kernel vulnerabilities that require a fresh user namespace become exploitable by unprivileged users. Fine on a test machine; on production you want a proper AppArmor profile that allows the specific binary instead.</p>
          </div>

          <p><strong>Setup as root</strong> — prepare the rootfs and an unprivileged user. The <code>chown</code> step is <em>critical</em>: with <code>--map-root-user</code> only one UID is mapped (0 ↔ 1001). Files in the rootfs were created by root (host UID 0), and from inside the namespace that host UID 0 is unmapped, so they show up as <code>nobody</code>/overflow. The namespace's "root" cannot write to them. Handing ownership to <code>myuser</code> beforehand fixes that.</p>

          <pre><code># As host root
mkdir -p /tmp/mycontainer/rootfs
docker export $(docker create alpine) | tar -xC /tmp/mycontainer/rootfs

# Unprivileged user
useradd -m -u 1001 -s /bin/bash myuser
echo 'myuser:12345' | chpasswd

# The user must own the rootfs to be able to write to it
# from the user namespace where their UID 0 maps to host 1001
chown -R 1001:1001 /tmp/mycontainer</code></pre>

          <p><strong>As <code>myuser</code></strong> — enter the user namespace and assemble the container. <code>--mount</code> is redundant because <code>--mount-proc</code> already implies it:</p>

          <pre><code>su - myuser

# Watch the --mount-proc path: use an ABSOLUTE path that matches where /proc
# will live after pivot_root. A relative path resolves against your cwd,
# ends up outside the new root, and disappears with the umount of /.old_root.
unshare --user --map-root-user \\
        --pid --fork --uts --ipc --net \\
        --mount-proc=/tmp/mycontainer/rootfs/proc \\
        /bin/bash

# Inside: you are "root" in the user namespace
id
# uid=0(root) gid=0(root)

# But the mapping shows "root" = your real host UID
cat /proc/self/uid_map
# 0  1001  1          ← internal UID 0 = external UID 1001

# The rest (mount, pivot_root, etc.) works the same because
# you have CAP_SYS_ADMIN inside the user namespace.
mount --make-rprivate /

# WATCH OUT: --rbind, not --bind. --mount-proc already mounted procfs
# at /tmp/mycontainer/rootfs/proc; a non-recursive bind would create a
# new mount point on top of that path and shadow the procfs (you would
# see the empty /proc directory from the Alpine tarball, and ps would
# list nothing). --rbind preserves sub-mounts through pivot_root.
mount --rbind /tmp/mycontainer/rootfs /tmp/mycontainer/rootfs
cd /tmp/mycontainer/rootfs &amp;&amp; mkdir -p .old_root
pivot_root . .old_root
cd / &amp;&amp; umount -l /.old_root &amp;&amp; rmdir /.old_root
hash -r                       # clear the shell's command cache

# /proc is ALREADY mounted (preserved by --rbind): --mount-proc dropped it
# at /tmp/mycontainer/rootfs/proc, which after pivot_root is /proc.
# Do NOT try 'mount -t proc proc /proc' here — it fails with EPERM because
# mounting a fresh proc inside a user namespace requires an existing
# proc "lineage" from the same user+pid namespace already visible, and
# after the umount of the old root none is reachable.
ls /proc | head -3            # 1  16  17   ← just bash and its children
mount -t tmpfs tmpfs /tmp     # tmpfs can always be mounted</code></pre>

          <p>Key conceptual point: the "root" you see inside the namespace is root <em>for operations that live inside this user namespace</em>. You have <code>CAP_SYS_ADMIN</code>, you can <code>mount</code>, you can <code>chmod</code> files created by processes in the namespace. But the kernel still evaluates you as UID 1001 whenever you try anything that crosses the boundary — touching host files owned by an unmapped UID, sending signals to processes outside your PID namespace, invoking syscalls that need caps in the initial user namespace. It's the same idea covered in <a href="/tutorial/que-es-realmente-un-contenedor/capabilities#why-root-inside-a-container-is-still-dangerous">why root inside a container is still dangerous</a>, but now with a real barrier: the kernel's mapping makes the two perspectives (the namespace's and the host's) actually different for everything that matters.</p>

          <div class="callout callout-note">
            <span class="callout-label">Rootless mode limitations</span>
            <p>Not every operation from Step 4 works. <code>mount -t devtmpfs dev /dev</code> <strong>fails</strong> because it requires CAP_SYS_ADMIN in the <em>initial</em> user namespace, not your derived one. Practical workaround: use <code>mount -t tmpfs tmpfs /dev</code> and <code>mknod</code> the few devices you need (also limited), or bind-mount specific entries like <code>/dev/null</code>, <code>/dev/zero</code> from the host.</p>
            <p>OverlayFS over user namespaces <em>does</em> work since kernel 5.11+ (<a href="https://docs.kernel.org/filesystems/overlayfs.html#user-xattr" target="_blank" rel="noopener">unprivileged overlay</a>). On older kernels you need FUSE-overlayfs — exactly what Podman falls back to in those cases.</p>
          </div>

          <p>Verify the privilege isolation from another host terminal:</p>

          <pre><code># From outside (host terminal, no sudo)
BASH_PID=$(pgrep -f 'unshare.*mount-proc' | xargs -I{} pgrep -P {})

# The bash inside the rootless container runs as YOUR real UID
ps -o pid,uid,user,comm -p \${BASH_PID}
# PID   UID USER     COMMAND
# 1234 1001 ubuntu   bash                ← host UID 1001
#                                         (even though inside it says "root")</code></pre>

          <p>If that process escapes the container (runtime breakout, kernel vulnerability), it lands on the host as <strong>ubuntu</strong>, not <strong>root</strong>. The damage it can do is limited to what your regular user can do. It is the difference between "a bug means your CI is compromised" and "a bug means your server is compromised".</p>

          <h2>Final result</h2>

          <pre><code># Inside the manual container:
ps aux         # Only bash and ps (isolated PID namespace)
hostname       # my-container (UTS namespace)
ip addr        # Only loopback (net namespace)
ls /           # Alpine (pivot_root in effect)
cat /proc/1/cgroup  # Points to the cgroup we created</code></pre>

          <p>This is exactly what a container runtime does, with a few differences:</p>
          <ul>
            <li>Runtimes read configuration from an OCI bundle (<code>config.json</code>), not from flags.</li>
            <li>They use seccomp to filter dangerous syscalls (we did not cover that here).</li>
            <li>They apply AppArmor or SELinux profiles as an additional layer.</li>
            <li>They configure the veth pair and connect it to a bridge before entering the network namespace.</li>
          </ul>

          <p>But the structure is identical. What you just built <em>is</em> a container.</p>
        `,
};
