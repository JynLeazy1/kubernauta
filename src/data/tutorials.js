const tutorials = [
  {
    id: 1,
    slug: "que-es-realmente-un-contenedor",
    title: {
      es: "¿Qué es realmente un contenedor?",
      en: "What exactly is a Container?",
    },
    subtitle: {
      es: "Construyendo un contenedor desde 0",
      en: "Building a Container from Scratch",
    },
    description: {
      es: "Desmontamos la ilusión capa por capa: namespaces, capabilities, chroot, pivot_root, OverlayFS y cgroups. Al final construimos un contenedor funcional con comandos del kernel, sin Docker.",
      en: "We dismantle the illusion layer by layer: namespaces, capabilities, chroot, pivot_root, OverlayFS, and cgroups. By the end, we build a working container using kernel primitives — no Docker required.",
    },
    tags: ["linux", "namespaces", "cgroups", "overlayfs", "internals"],
    parts: [
      {
        order: 1,
        slug: "introduccion",
        title: {
          es: "Introducción: ¿qué es realmente un contenedor?",
          en: "Introduction: What is a Container, Really?",
        },
        content: {
          es: `
          <p>Si le preguntas a alguien qué es un contenedor, probablemente diga algo como "una VM liviana" o "un proceso aislado". Ninguna de las dos respuestas es del todo correcta.</p>

          <p>Un contenedor es un <strong>proceso ordinario de Linux</strong> al que el kernel le aplica un conjunto de mecanismos de aislamiento y control. No hay hypervisor, no hay kernel propio, no hay hardware virtualizado. El contenedor comparte el kernel del host — lo que cambia es <em>cómo ese proceso percibe el sistema que lo rodea</em>.</p>

          <p>Esta serie desmonta esa ilusión pieza por pieza, con comandos reales que puedes ejecutar en cualquier Linux moderno.</p>

          <h2>Qué cubriremos</h2>

          <ol>
            <li><strong>Linux Namespaces</strong> — la ilusión de estar solo: PID, red, filesystem, hostname y más.</li>
            <li><strong>Linux Capabilities</strong> — por qué "root dentro de un contenedor" no es el mismo root del host.</li>
            <li><strong>chroot y pivot_root</strong> — cómo cambiar la raíz del filesystem y por qué <code>pivot_root</code> es más seguro que <code>chroot</code>.</li>
            <li><strong>OverlayFS</strong> — el filesystem de capas que hace posible las imágenes Docker.</li>
            <li><strong>cgroups v1 y v2</strong> — control real de CPU, memoria e I/O.</li>
            <li><strong>Construyendo un contenedor desde 0</strong> — juntamos todo con <code>unshare</code>, <code>pivot_root</code> y un rootfs real.</li>
            <li><strong>Lo que hace el container runtime</strong> — qué hace <code>runc</code> exactamente cuando ejecutas <code>docker run</code>.</li>
            <li><strong>Resumen de la serie</strong> — el mapa completo y próximos pasos.</li>
          </ol>

          <h2>Prerrequisitos</h2>

          <p>Para seguir los ejemplos necesitas:</p>
          <ul>
            <li>Un Linux moderno con kernel ≥ 5.10 (Ubuntu 22.04+, Debian 12+, Fedora 37+)</li>
            <li><code>docker</code> instalado (para los ejemplos comparativos)</li>
            <li>Acceso a <code>sudo</code></li>
            <li>Las herramientas: <code>util-linux</code> (<code>unshare</code>, <code>lsns</code>), <code>iproute2</code>, <code>libcap2-bin</code> (<code>capsh</code>)</li>
          </ul>

          <pre><code># Ubuntu/Debian
sudo apt install util-linux iproute2 libcap2-bin</code></pre>

          <h2>La pregunta central</h2>

          <p>Al final de esta serie deberías poder responder: <em>¿puedo crear un "contenedor" con comandos del kernel sin Docker?</em></p>

          <p>La respuesta es sí. Y hacerlo te enseña más sobre contenedores que años de usar <code>docker run</code>.</p>
        `,
          en: `
          <p>Ask someone what a container is, and they'll probably say something like "a lightweight VM" or "an isolated process." Neither answer is entirely correct.</p>

          <p>A container is an <strong>ordinary Linux process</strong> to which the kernel applies a set of isolation and control mechanisms. There is no hypervisor, no separate kernel, no virtualized hardware. The container shares the host kernel — what changes is <em>how that process perceives the system around it</em>.</p>

          <p>This series dismantles that illusion piece by piece, using real commands you can run on any modern Linux system.</p>

          <h2>What we'll cover</h2>

          <ol>
            <li><strong>Linux Namespaces</strong> — the illusion of being alone: PID, network, filesystem, hostname, and more.</li>
            <li><strong>Linux Capabilities</strong> — why "root inside a container" is not the same as root on the host.</li>
            <li><strong>chroot and pivot_root</strong> — how to change the filesystem root and why <code>pivot_root</code> is safer than <code>chroot</code>.</li>
            <li><strong>OverlayFS</strong> — the layered filesystem that makes Docker images possible.</li>
            <li><strong>cgroups v1 and v2</strong> — real control over CPU, memory, and I/O.</li>
            <li><strong>Building a container from scratch</strong> — assembling everything with <code>unshare</code>, <code>pivot_root</code>, and a real rootfs.</li>
            <li><strong>What the container runtime does</strong> — exactly what <code>runc</code> does when you run <code>docker run</code>.</li>
            <li><strong>Series summary</strong> — the complete map and next steps.</li>
          </ol>

          <h2>Prerequisites</h2>

          <p>To follow the examples you need:</p>
          <ul>
            <li>A modern Linux system with kernel ≥ 5.10 (Ubuntu 22.04+, Debian 12+, Fedora 37+)</li>
            <li><code>docker</code> installed (for the comparative examples)</li>
            <li>Access to <code>sudo</code></li>
            <li>The tools: <code>util-linux</code> (<code>unshare</code>, <code>lsns</code>), <code>iproute2</code>, <code>libcap2-bin</code> (<code>capsh</code>)</li>
          </ul>

          <pre><code># Ubuntu/Debian
sudo apt install util-linux iproute2 libcap2-bin</code></pre>

          <h2>The central question</h2>

          <p>By the end of this series you should be able to answer: <em>can I create a "container" using kernel commands without Docker?</em></p>

          <p>The answer is yes. And doing it will teach you more about containers than years of running <code>docker run</code>.</p>
        `,
        },
      },
      {
        order: 2,
        slug: "namespaces",
        title: {
          es: "Linux Namespaces: los ocho tipos a fondo",
          en: "Linux Namespaces: All Eight Types in Depth",
        },
        content: {
          es: `
          <p>Un namespace es un envoltorio alrededor de un recurso global del kernel. Los procesos dentro del namespace ven su propia copia aislada de ese recurso — los cambios no son visibles fuera. El kernel de Linux tiene actualmente ocho tipos, cada uno con un propósito preciso.</p>

          <p>Antes de entrar a cada uno, establece la referencia: arranca un nginx y guarda su PID.</p>

          <pre><code>docker run --name demo --rm -d nginx:alpine
NGINX_PID=$(pgrep --oldest nginx)
sudo lsns -p \${NGINX_PID}</code></pre>

          <pre><code>        NS TYPE   NPROCS     PID USER COMMAND
4026531834 time      761       1 root /sbin/init splash
4026531837 user      707       1 root /sbin/init splash
4026535750 mnt        17 3385932 root nginx: master process nginx -g daemon off;
4026535751 uts        17 3385932 root nginx: master process nginx -g daemon off;
4026535752 ipc        17 3385932 root nginx: master process nginx -g daemon off;
4026535753 pid        17 3385932 root nginx: master process nginx -g daemon off;
4026535754 cgroup     17 3385932 root nginx: master process nginx -g daemon off;
4026535755 net        17 3385932 root nginx: master process nginx -g daemon off;</code></pre>

          <p><code>time</code> y <code>user</code> apuntan al PID 1 del host — son namespaces compartidos. Los seis restantes son exclusivos del contenedor. Vamos uno por uno.</p>

          <h2>1. mnt — Mount namespace</h2>

          <p><strong>Flag:</strong> <code>CLONE_NEWNS</code> — el primero en existir (Linux 2.4.19, 2002), de ahí el nombre genérico "NS".</p>

          <p>Aisla la <strong>tabla de montajes</strong> del proceso: qué filesystems están montados y en qué puntos. Cada proceso hereda la tabla del padre al nacer, pero dentro de un mount namespace los cambios son locales — montar o desmontar algo no afecta a procesos fuera del namespace.</p>

          <pre><code>sudo unshare --mount bash</code></pre>

          <p><code>unshare</code> invoca la syscall <code>unshare(2)</code>, que desasocia al proceso actual de uno o más namespaces compartidos y crea otros nuevos. El flag <code>--mount</code> le indica que cree un nuevo mount namespace. <code>bash</code> es el proceso que se ejecutará dentro de ese nuevo namespace — hereda la tabla de montajes del padre en el momento del <code>unshare</code>, pero a partir de aquí sus cambios son locales.</p>

          <pre><code>mount -t tmpfs demo /mnt</code></pre>

          <p><code>mount</code> llama a la syscall <code>mount(2)</code> para registrar un nuevo filesystem en la tabla de montajes del namespace actual. Los argumentos:</p>
          <ul>
            <li><code>-t tmpfs</code> — el tipo de filesystem. <code>tmpfs</code> vive completamente en memoria RAM (y swap si hay presión), no tiene dispositivo de bloque subyacente.</li>
            <li><code>demo</code> — el "device". Para filesystems virtuales como <code>tmpfs</code>, <code>proc</code> o <code>sysfs</code> este campo es ignorado por el kernel; es solo una etiqueta que aparece en <code>/proc/mounts</code> para identificar el mount.</li>
            <li><code>/mnt</code> — el punto de montaje: el directorio del filesystem actual donde quedará visible el nuevo filesystem. El directorio debe existir antes del montaje.</li>
          </ul>

          <p>Este mount solo existe en la tabla del namespace actual. En otra terminal del host, <code>/mnt</code> sigue vacío o con su contenido original — el kernel mantiene tablas de montajes separadas por namespace.</p>

          <pre><code>cat /proc/\${NGINX_PID}/mounts

overlay / overlay rw,relatime,lowerdir=...,upperdir=...,workdir=... 0 0
proc /proc proc rw,nosuid,nodev,noexec,relatime 0 0
tmpfs /dev tmpfs rw,nosuid,size=65536k,mode=755 0 0
devpts /dev/pts devpts rw,nosuid,noexec,relatime,gid=5,mode=620 0 0
sysfs /sys sysfs ro,nosuid,nodev,noexec,relatime 0 0
...</code></pre>

          <p><code>/proc/&lt;pid&gt;/mounts</code> es un archivo virtual que el kernel genera en tiempo real — lee la tabla de montajes del mount namespace al que pertenece ese proceso. Cada línea sigue el formato:</p>

          <pre><code>dispositivo  punto-de-montaje  tipo  opciones  dump  pass</code></pre>

          <p>Las opciones de la primera línea (<code>overlay /</code>) merecen atención:</p>
          <ul>
            <li><code>rw</code> — montado en lectura-escritura (el <code>upperdir</code> acepta escrituras).</li>
            <li><code>relatime</code> — actualiza el <code>atime</code> solo si es anterior a <code>mtime</code> o <code>ctime</code>, reduciendo escrituras innecesarias.</li>
            <li><code>lowerdir</code> — las capas de solo lectura de la imagen, separadas por <code>:</code>.</li>
            <li><code>upperdir</code> — la capa de escritura exclusiva de este contenedor.</li>
            <li><code>workdir</code> — directorio auxiliar que OverlayFS usa internamente para operaciones atómicas.</li>
          </ul>

          <p>La línea de <code>proc</code> también es relevante: <code>nosuid,nodev,noexec</code> son flags de seguridad que impiden ejecutar binarios setuid, acceder a dispositivos o ejecutar código desde <code>/proc</code>. Son los mismos flags que <code>runc</code> aplica al montar el <code>/proc</code> del contenedor.</p>

          <p>Para ver la tabla del host y compararla:</p>

          <pre><code>cat /proc/1/mounts | wc -l      # ~30-50 entradas en un host típico
cat /proc/\${NGINX_PID}/mounts | wc -l  # ~20 entradas, filesystem mínimo del contenedor</code></pre>

          <p>Mismo kernel. Dos tablas de montajes completamente distintas.</p>

          <h2>2. uts — UTS namespace</h2>

          <p><strong>Flag:</strong> <code>CLONE_NEWUTS</code> — "UTS" viene de Unix Time-sharing System, la estructura del kernel que guarda hostname y domainname.</p>

          <p>Aisla el <strong>hostname</strong> y el <strong>NIS domainname</strong> del proceso. Es el namespace más sencillo y el primero que se nota al entrar a un contenedor.</p>

          <pre><code># En el host
hostname      # mi-host

# crea un nuevo UTS namespace y entra a bash
sudo unshare --uts bash

# asigna un nuevo hostname dentro del namespace
hostname contenedor-demo

# verifica el hostname dentro del namespace
hostname      # contenedor-demo

# En otra terminal del host:
hostname      # mi-host   # sigue siendo el hostname original</code></pre>

          <p>Importancia práctica: permite que cada contenedor tenga su propio hostname sin afectar al host ni a otros contenedores. Herramientas de logging, métricas y service discovery usan el hostname para identificar la fuente — sin este namespace, todos los contenedores del mismo nodo reportarían el hostname del host.</p>


          <div class="callout callout-note">
            <span class="callout-label">Nota</span>
            <p>El flag <code>--name demo</code> es solo un alias para los comandos de Docker y no se propaga al interior del contenedor. El hostname real es el <strong>ID del contenedor</strong> (los primeros 12 caracteres). Para definirlo explícitamente usa <code>--hostname</code>:</p>
             <pre><code># Verificar el hostname dentro de un contenedor sin --hostname
docker exec demo hostname
# eb4982ca6e37  ← el ID del contenedor truncado a 12 caracteres, no el --name</code></pre>
            <pre><code># Verificar el hostname dentro de un contenedor con --hostname
docker run --name demo --hostname mi-servidor --rm -d nginx:alpine
docker exec demo hostname
# mi-servidor</code></pre>
          </div>

          <h2>3. ipc — IPC namespace</h2>

          <p><strong>Flag:</strong> <code>CLONE_NEWIPC</code> — aisla los mecanismos de comunicación entre procesos de System V y POSIX.</p>

          <p>Recursos que aisla:</p>
          <ul>
            <li><strong>Semáforos System V</strong> (<code>semget</code>, <code>semop</code>)</li>
            <li><strong>Colas de mensajes</strong> (<code>msgget</code>, <code>msgsnd</code>)</li>
            <li><strong>Segmentos de memoria compartida</strong> (<code>shmget</code>, <code>shmat</code>)</li>
            <li><strong>Colas de mensajes POSIX</strong> (<code>/dev/mqueue</code>)</li>
          </ul>

          <pre><code># Crear un segmento de memoria compartida en el host
ipcmk -M 1024
# Shared memory id: 131072

# Listar IPC en el host
ipcs -m
# ------ Shared Memory Segments --------
# key        shmid  owner  perms  bytes  nattch
# 0x...     131072  user   644    1024   0

# Desde dentro del contenedor: no existe
docker exec demo sh -c "apk add -q util-linux && ipcs -m"
# ------ Shared Memory Segments --------
# (vacío)</code></pre>

          <p>Esto es crítico para seguridad: sin el namespace IPC, un proceso malicioso en un contenedor podría acceder o corromper segmentos de memoria compartida de otros procesos del host. Aplicaciones legacy que usan IPC de System V (bases de datos antiguas, middleware) son especialmente vulnerables sin este aislamiento.</p>

          <p>En Kubernetes, los Pods <em>comparten</em> el namespace IPC entre sus contenedores por defecto — es una de las formas en que los sidecars se comunican eficientemente con el contenedor principal sin overhead de red.</p>

          <h2>4. pid — PID namespace</h2>

          <p><strong>Flag:</strong> <code>CLONE_NEWPID</code> — aisla el árbol de procesos. Es uno de los namespaces con más implicaciones de seguridad y operación.</p>

          <p>El primer proceso creado en un nuevo PID namespace recibe <strong>PID 1</strong> dentro de él. Desde fuera (el host), ese proceso tiene un PID distinto y mayor:</p>

          <pre><code>sudo unshare --pid --fork --mount-proc bash

# Dentro del namespace:
echo $$        # 1
ps aux
# PID   USER     COMMAND
#   1   root     bash
#   7   root     ps aux

# En otra terminal del host:
pgrep bash     # 3385932  ← el PID real en el host</code></pre>

          <p>El PID namespace tiene dos consecuencias importantes:</p>

          <p><strong>a) Señales y reaping de zombies.</strong> PID 1 en Linux tiene una responsabilidad especial: adoptar procesos huérfanos y hacer <code>wait()</code> para evitar zombies. Si tu entrypoint no maneja señales correctamente, un <code>docker stop</code> manda SIGTERM al PID 1 del contenedor. Si ese proceso no lo reenvía a sus hijos, Docker espera 10 segundos y manda SIGKILL. Por eso existe <code>tini</code> y la instrucción <code>ENTRYPOINT ["/sbin/tini", "--"]</code>.</p>

          <pre><code># Ver el proceso init de un contenedor
docker exec demo ps aux
# PID   USER  COMMAND
#   1   root  nginx: master process nginx -g daemon off;
#  31   root  nginx: worker process
#  32   root  ps aux</code></pre>

          <p><strong>b) Visibilidad unidireccional.</strong> Desde el host puedes ver todos los procesos de todos los contenedores. Desde dentro del contenedor solo ves los procesos de tu PID namespace. Un proceso en el contenedor no puede enviar señales a procesos del host aunque tenga el PID correcto — el PID namespace lo blinda.</p>

          <pre><code># El host ve el PID real de nginx
ps aux | grep nginx
# root  3385932  nginx: master process nginx -g daemon off;

# Dentro del contenedor, ese mismo proceso tiene PID 1
docker exec demo ps aux | grep nginx
# 1  root  nginx: master process nginx -g daemon off;</code></pre>

          <h2>5. net — Network namespace</h2>

          <p><strong>Flag:</strong> <code>CLONE_NEWNET</code> — aisla el stack de red completo: interfaces, tabla de rutas, tabla ARP, reglas de iptables/nftables, conexiones TCP/UDP, sockets Unix.</p>

          <p>Un nuevo network namespace nace con solo la interfaz loopback (<code>lo</code>), down por defecto:</p>

          <pre><code>sudo unshare --net bash
ip addr
# 1: lo: &lt;LOOPBACK&gt; mtu 65536 qdisc noop state DOWN
#     link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00</code></pre>

          <p>Para que el contenedor tenga conectividad, Docker crea un <strong>veth pair</strong> — un cable virtual con dos extremos. Uno entra al namespace del contenedor como <code>eth0</code>, el otro queda en el host conectado al bridge <code>docker0</code>:</p>

          <pre><code># En el host: ver los veth pairs activos
ip link show type veth
# 6: veth3a1b2c@if5: &lt;BROADCAST,MULTICAST,UP&gt; mtu 1500 ...
#     link/ether 8a:3f:1c:2d:4e:5f brd ff:ff:ff:ff:ff:ff
#     master docker0

# Dentro del contenedor: su extremo del par
docker exec demo ip addr show eth0
# 5: eth0@if6: &lt;BROADCAST,MULTICAST,UP&gt; mtu 1500
#     inet 172.17.0.2/16 brd 172.17.255.255 scope global eth0

# El índice @if6 apunta a la interfaz 6 del host (veth3a1b2c)
# El índice @if5 del host apunta a la interfaz 5 del contenedor (eth0)</code></pre>

          <p>Cada contenedor tiene su propia tabla de rutas, reglas de iptables y conexiones activas. Docker gestiona las reglas de NAT en el host (<code>iptables -t nat -L DOCKER</code>) para que el tráfico entre <code>docker0</code> y el exterior funcione.</p>

          <pre><code># Ver las conexiones TCP activas del contenedor (solo las suyas)
sudo nsenter -t \${NGINX_PID} --net ss -tlnp
# State  Recv-Q  Send-Q  Local Address:Port
# LISTEN 0       511           0.0.0.0:80</code></pre>

          <h2>6. user — User namespace</h2>

          <p><strong>Flag:</strong> <code>CLONE_NEWUSER</code> — el más poderoso y el más complejo. Aisla UIDs y GIDs, permitiendo mapear identidades entre el namespace y el host.</p>

          <p>La capacidad crítica: un proceso puede ser UID 0 (root) <em>dentro</em> del namespace pero mapearse a un UID no privilegiado en el host. Esto es la base de los contenedores <strong>rootless</strong>.</p>

          <pre><code># Crear un user namespace sin necesitar sudo
unshare --user --map-root-user bash

# Dentro: somos root
id
# uid=0(root) gid=0(root) groups=0(root),...

# El kernel mapea ese UID 0 interno a nuestro UID real del host
cat /proc/self/uid_map
# 0  1000  1   ← UID 0 del namespace = UID 1000 del host</code></pre>

          <p>El archivo <code>/proc/self/uid_map</code> tiene el formato: <code>&lt;uid-inicio-namespace&gt; &lt;uid-inicio-host&gt; &lt;cantidad&gt;</code>. En este caso, solo hay un mapeo: el UID 0 del namespace corresponde al UID 1000 del host.</p>

          <p>Docker <strong>no activa</strong> el user namespace por defecto porque históricamente tuvo problemas de compatibilidad con algunas imágenes. Cuando UID 0 del contenedor = UID 0 del host, una fuga del contenedor aterrizas como root real. Con <code>--userns-remap</code> en el daemon de Docker o usando Podman (que es rootless por defecto), ese riesgo desaparece:</p>

          <pre><code># Verificar si Docker usa user namespace
docker info | grep "Security Options" -A5
# Seccomp, AppArmor... pero no userns por defecto

# Con Podman (rootless nativo):
podman run --rm alpine id
# uid=0(root) gid=0(root)  ← root dentro del contenedor

podman run --rm alpine cat /proc/self/uid_map
# 0  100000  65536  ← UID 0 → UID 100000 en el host</code></pre>

          <h2>7. cgroup — Cgroup namespace</h2>

          <p><strong>Flag:</strong> <code>CLONE_NEWCGROUP</code> — virtualiza la vista del filesystem <code>/sys/fs/cgroup</code> para el proceso.</p>

          <p>Sin este namespace, un proceso dentro del contenedor podría leer toda la jerarquía de cgroups del host — incluyendo los de otros contenedores, con sus límites de recursos y métricas. Con él, el proceso ve su propio cgroup como si fuera la raíz:</p>

          <pre><code># En el host: el cgroup real de nginx es una ruta larga
cat /proc/\${NGINX_PID}/cgroup
# 0::/system.slice/docker-eb4982ca6e37...fab.scope

# Dentro del contenedor: ve "/" como su raíz de cgroup
docker exec demo cat /proc/1/cgroup
# 0::/</code></pre>

          <p>Esto tiene dos beneficios: privacidad (el contenedor no puede descubrir otros contenedores por sus cgroups) y simplicidad para herramientas que leen <code>/proc/self/cgroup</code> para autodetectar sus límites de recursos.</p>

          <h2>8. time — Time namespace</h2>

          <p><strong>Flag:</strong> <code>CLONE_NEWTIME</code> — el más nuevo (Linux 5.6, 2020). Aisla dos relojes específicos: <code>CLOCK_MONOTONIC</code> y <code>CLOCK_BOOTTIME</code>.</p>

          <p>Permite ajustar el offset de esos relojes para un proceso sin afectar al sistema. El reloj de pared (<code>CLOCK_REALTIME</code>) <em>no</em> se puede aislar — sería peligroso para la sincronización de tiempo del sistema.</p>

          <pre><code># Crear un time namespace con CLOCK_MONOTONIC desplazado 1 hora atrás
# (requiere kernel >= 5.6)
sudo unshare --time --monotonic-offset=-3600 bash

# El tiempo monótono dentro está 3600 segundos por detrás del host
cat /proc/self/timens_offsets
# monotonic  -3600  0
# boottime   -3600  0</code></pre>

          <p>Casos de uso principales: testing de código sensible al tiempo (simular que el sistema lleva N horas corriendo), migración en vivo de contenedores entre hosts (preservar el tiempo monótono para timeouts y TTLs activos), y entornos de CI que necesitan reproducibilidad de timestamps.</p>

          <p>Docker <strong>no crea</strong> un time namespace por defecto — aparece en <code>lsns</code> apuntando al PID 1 del host, igual que <code>user</code>.</p>

          <h2>Los namespaces como archivos: el mecanismo que une todo</h2>

          <p>Cada namespace existe como un archivo en <code>/proc/&lt;pid&gt;/ns/</code>. Mientras ese archivo esté abierto — por cualquier proceso o file descriptor — el namespace persiste aunque no haya ningún proceso dentro de él:</p>

          <pre><code>ls -la /proc/\${NGINX_PID}/ns/

dr-x--x--x 2 root root 0 mar 26 09:16 .
dr-xr-xr-x 9 root root 0 mar 26 09:16 ..
lrwxrwxrwx 1 root root 0 mar 26 09:17 cgroup -> 'cgroup:[4026535754]'
lrwxrwxrwx 1 root root 0 mar 26 09:17 ipc -> 'ipc:[4026535752]'
lrwxrwxrwx 1 root root 0 mar 26 09:16 mnt -> 'mnt:[4026535750]'
lrwxrwxrwx 1 root root 0 mar 26 09:16 net -> 'net:[4026535755]'
lrwxrwxrwx 1 root root 0 mar 26 09:17 pid -> 'pid:[4026535753]'
lrwxrwxrwx 1 root root 0 mar 26 09:19 pid_for_children -> 'pid:[4026535753]'
lrwxrwxrwx 1 root root 0 mar 26 09:17 time -> 'time:[4026531834]'
lrwxrwxrwx 1 root root 0 mar 26 09:19 time_for_children -> 'time:[4026531834]'
lrwxrwxrwx 1 root root 0 mar 26 09:17 user -> 'user:[4026531837]'
lrwxrwxrwx 1 root root 0 mar 26 09:17 uts -> 'uts:[4026535751]'</code></pre>

          <p>Dos procesos que comparten el mismo inode comparten el mismo namespace. Esto es exactamente cómo funciona <code>docker exec</code>: usa <code>setns()</code> para unirse a los namespaces del contenedor antes de ejecutar el comando:</p>

          <pre><code># nsenter hace lo mismo que docker exec, manualmente
sudo nsenter -t \${NGINX_PID} --pid --net --mnt --uts --ipc bash

# Ahora estás dentro de todos los namespaces del contenedor
hostname    # el hostname del contenedor
ip addr     # la red del contenedor
ps aux      # los procesos del contenedor</code></pre>

          <p>El par <code>pid_for_children</code> / <code>time_for_children</code> indica el namespace que <em>heredarán</em> los procesos hijos creados desde este punto. Normalmente apunta al mismo namespace que <code>pid</code> / <code>time</code>, pero puede diferir si el proceso está en medio de una transición de namespace.</p>
        `,
          en: `
          <p>A namespace is a wrapper around a global kernel resource. Processes inside the namespace see their own isolated copy of that resource — changes are not visible outside. The Linux kernel currently has eight types, each with a specific purpose.</p>

          <p>Before diving into each one, establish a reference point: start an nginx container and save its PID.</p>

          <pre><code>docker run --name demo --rm -d nginx:alpine
NGINX_PID=$(pgrep --oldest nginx)
sudo lsns -p \${NGINX_PID}</code></pre>

          <pre><code>        NS TYPE   NPROCS     PID USER COMMAND
4026531834 time      761       1 root /sbin/init splash
4026531837 user      707       1 root /sbin/init splash
4026535750 mnt        17 3385932 root nginx: master process nginx -g daemon off;
4026535751 uts        17 3385932 root nginx: master process nginx -g daemon off;
4026535752 ipc        17 3385932 root nginx: master process nginx -g daemon off;
4026535753 pid        17 3385932 root nginx: master process nginx -g daemon off;
4026535754 cgroup     17 3385932 root nginx: master process nginx -g daemon off;
4026535755 net        17 3385932 root nginx: master process nginx -g daemon off;</code></pre>

          <p><code>time</code> and <code>user</code> point to PID 1 on the host — these are shared namespaces. The remaining six are exclusive to the container. Let's go through them one by one.</p>

          <h2>1. mnt — Mount namespace</h2>

          <p><strong>Flag:</strong> <code>CLONE_NEWNS</code> — the first to exist (Linux 2.4.19, 2002), hence the generic name "NS".</p>

          <p>Isolates the process's <strong>mount table</strong>: which filesystems are mounted and at which points. Each process inherits the parent's mount table at creation, but inside a mount namespace changes are local — mounting or unmounting something does not affect processes outside the namespace.</p>

          <pre><code>sudo unshare --mount bash</code></pre>

          <p><code>unshare</code> invokes the <code>unshare(2)</code> syscall, which dissociates the current process from one or more shared namespaces and creates new ones. The <code>--mount</code> flag tells it to create a new mount namespace. <code>bash</code> is the process that will run inside that new namespace — it inherits the parent's mount table at the time of the <code>unshare</code>, but from this point on its changes are local.</p>

          <pre><code>mount -t tmpfs demo /mnt</code></pre>

          <p><code>mount</code> calls the <code>mount(2)</code> syscall to register a new filesystem in the current namespace's mount table. The arguments:</p>
          <ul>
            <li><code>-t tmpfs</code> — the filesystem type. <code>tmpfs</code> lives entirely in RAM (and swap under memory pressure) and has no underlying block device.</li>
            <li><code>demo</code> — the "device". For virtual filesystems like <code>tmpfs</code>, <code>proc</code>, or <code>sysfs</code>, this field is ignored by the kernel; it is just a label that appears in <code>/proc/mounts</code> to identify the mount.</li>
            <li><code>/mnt</code> — the mount point: the directory in the current filesystem where the new filesystem will be visible. The directory must exist before mounting.</li>
          </ul>

          <p>This mount only exists in the current namespace's table. In another terminal on the host, <code>/mnt</code> still shows its original contents — the kernel maintains separate mount tables per namespace.</p>

          <pre><code>cat /proc/\${NGINX_PID}/mounts

overlay / overlay rw,relatime,lowerdir=...,upperdir=...,workdir=... 0 0
proc /proc proc rw,nosuid,nodev,noexec,relatime 0 0
tmpfs /dev tmpfs rw,nosuid,size=65536k,mode=755 0 0
devpts /dev/pts devpts rw,nosuid,noexec,relatime,gid=5,mode=620 0 0
sysfs /sys sysfs ro,nosuid,nodev,noexec,relatime 0 0
...</code></pre>

          <p><code>/proc/&lt;pid&gt;/mounts</code> is a virtual file the kernel generates in real time — it reads the mount table of the mount namespace that process belongs to. Each line follows the format:</p>

          <pre><code>device  mount-point  type  options  dump  pass</code></pre>

          <p>The options on the first line (<code>overlay /</code>) deserve attention:</p>
          <ul>
            <li><code>rw</code> — mounted read-write (the <code>upperdir</code> accepts writes).</li>
            <li><code>relatime</code> — updates <code>atime</code> only if it is earlier than <code>mtime</code> or <code>ctime</code>, reducing unnecessary writes.</li>
            <li><code>lowerdir</code> — the read-only image layers, separated by <code>:</code>.</li>
            <li><code>upperdir</code> — the writable layer exclusive to this container.</li>
            <li><code>workdir</code> — an auxiliary directory that OverlayFS uses internally for atomic operations.</li>
          </ul>

          <p>The <code>proc</code> line is also relevant: <code>nosuid,nodev,noexec</code> are security flags that prevent executing setuid binaries, accessing devices, or running code from <code>/proc</code>. These are the same flags that <code>runc</code> applies when mounting the container's <code>/proc</code>.</p>

          <p>To view the host's table for comparison:</p>

          <pre><code>cat /proc/1/mounts | wc -l      # ~30-50 entries on a typical host
cat /proc/\${NGINX_PID}/mounts | wc -l  # ~20 entries, container's minimal filesystem</code></pre>

          <p>Same kernel. Two completely different mount tables.</p>

          <h2>2. uts — UTS namespace</h2>

          <p><strong>Flag:</strong> <code>CLONE_NEWUTS</code> — "UTS" comes from Unix Time-sharing System, the kernel structure that stores the hostname and domainname.</p>

          <p>Isolates the process's <strong>hostname</strong> and <strong>NIS domainname</strong>. It is the simplest namespace and the first one you notice when entering a container.</p>

          <pre><code># On the host
hostname      # my-host

# create a new UTS namespace and enter bash
sudo unshare --uts bash

# assign a new hostname inside the namespace
hostname container-demo

# verify the hostname inside the namespace
hostname      # container-demo

# In another terminal on the host:
hostname      # my-host   # still the original hostname</code></pre>

          <p>Practical importance: it allows each container to have its own hostname without affecting the host or other containers. Logging, metrics, and service discovery tools use the hostname to identify the source — without this namespace, all containers on the same node would report the host's hostname.</p>


          <div class="callout callout-note">
            <span class="callout-label">Note</span>
            <p>The <code>--name demo</code> flag is just an alias for Docker commands and is not propagated inside the container. The actual hostname is the <strong>container ID</strong> (the first 12 characters). To set it explicitly, use <code>--hostname</code>:</p>
             <pre><code># Check the hostname inside a container without --hostname
docker exec demo hostname
# eb4982ca6e37  ← the container ID truncated to 12 characters, not the --name</code></pre>
            <pre><code># Check the hostname inside a container with --hostname
docker run --name demo --hostname my-server --rm -d nginx:alpine
docker exec demo hostname
# my-server</code></pre>
          </div>

          <h2>3. ipc — IPC namespace</h2>

          <p><strong>Flag:</strong> <code>CLONE_NEWIPC</code> — isolates System V and POSIX inter-process communication mechanisms.</p>

          <p>Resources it isolates:</p>
          <ul>
            <li><strong>System V semaphores</strong> (<code>semget</code>, <code>semop</code>)</li>
            <li><strong>Message queues</strong> (<code>msgget</code>, <code>msgsnd</code>)</li>
            <li><strong>Shared memory segments</strong> (<code>shmget</code>, <code>shmat</code>)</li>
            <li><strong>POSIX message queues</strong> (<code>/dev/mqueue</code>)</li>
          </ul>

          <pre><code># Create a shared memory segment on the host
ipcmk -M 1024
# Shared memory id: 131072

# List IPC on the host
ipcs -m
# ------ Shared Memory Segments --------
# key        shmid  owner  perms  bytes  nattch
# 0x...     131072  user   644    1024   0

# From inside the container: it does not exist
docker exec demo sh -c "apk add -q util-linux && ipcs -m"
# ------ Shared Memory Segments --------
# (empty)</code></pre>

          <p>This is critical for security: without the IPC namespace, a malicious process inside a container could access or corrupt shared memory segments belonging to other host processes. Legacy applications that use System V IPC (old databases, middleware) are especially vulnerable without this isolation.</p>

          <p>In Kubernetes, Pods <em>share</em> the IPC namespace among their containers by default — this is one of the ways sidecars communicate efficiently with the main container without network overhead.</p>

          <h2>4. pid — PID namespace</h2>

          <p><strong>Flag:</strong> <code>CLONE_NEWPID</code> — isolates the process tree. It is one of the namespaces with the most security and operational implications.</p>

          <p>The first process created in a new PID namespace receives <strong>PID 1</strong> inside it. From outside (the host), that process has a different, larger PID:</p>

          <pre><code>sudo unshare --pid --fork --mount-proc bash

# Inside the namespace:
echo $$        # 1
ps aux
# PID   USER     COMMAND
#   1   root     bash
#   7   root     ps aux

# In another terminal on the host:
pgrep bash     # 3385932  ← the real PID on the host</code></pre>

          <p>The PID namespace has two important consequences:</p>

          <p><strong>a) Signal handling and zombie reaping.</strong> PID 1 in Linux has a special responsibility: adopting orphaned processes and calling <code>wait()</code> to prevent zombies. If your entrypoint does not handle signals correctly, a <code>docker stop</code> sends SIGTERM to the container's PID 1. If that process does not forward it to its children, Docker waits 10 seconds and sends SIGKILL. This is why <code>tini</code> exists and why you see <code>ENTRYPOINT ["/sbin/tini", "--"]</code>.</p>

          <pre><code># View the init process of a container
docker exec demo ps aux
# PID   USER  COMMAND
#   1   root  nginx: master process nginx -g daemon off;
#  31   root  nginx: worker process
#  32   root  ps aux</code></pre>

          <p><strong>b) One-way visibility.</strong> From the host you can see all processes in all containers. From inside the container you only see processes in your PID namespace. A process inside the container cannot send signals to host processes even if it knows the correct PID — the PID namespace shields it.</p>

          <pre><code># The host sees the real PID of nginx
ps aux | grep nginx
# root  3385932  nginx: master process nginx -g daemon off;

# Inside the container, that same process has PID 1
docker exec demo ps aux | grep nginx
# 1  root  nginx: master process nginx -g daemon off;</code></pre>

          <h2>5. net — Network namespace</h2>

          <p><strong>Flag:</strong> <code>CLONE_NEWNET</code> — isolates the complete network stack: interfaces, routing table, ARP table, iptables/nftables rules, TCP/UDP connections, Unix sockets.</p>

          <p>A new network namespace starts with only the loopback interface (<code>lo</code>), down by default:</p>

          <pre><code>sudo unshare --net bash
ip addr
# 1: lo: &lt;LOOPBACK&gt; mtu 65536 qdisc noop state DOWN
#     link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00</code></pre>

          <p>To give the container connectivity, Docker creates a <strong>veth pair</strong> — a virtual cable with two ends. One end enters the container's namespace as <code>eth0</code>; the other stays on the host connected to the <code>docker0</code> bridge:</p>

          <pre><code># On the host: see active veth pairs
ip link show type veth
# 6: veth3a1b2c@if5: &lt;BROADCAST,MULTICAST,UP&gt; mtu 1500 ...
#     link/ether 8a:3f:1c:2d:4e:5f brd ff:ff:ff:ff:ff:ff
#     master docker0

# Inside the container: its end of the pair
docker exec demo ip addr show eth0
# 5: eth0@if6: &lt;BROADCAST,MULTICAST,UP&gt; mtu 1500
#     inet 172.17.0.2/16 brd 172.17.255.255 scope global eth0

# The @if6 index points to interface 6 on the host (veth3a1b2c)
# The host's @if5 index points to interface 5 in the container (eth0)</code></pre>

          <p>Each container has its own routing table, iptables rules, and active connections. Docker manages the NAT rules on the host (<code>iptables -t nat -L DOCKER</code>) so that traffic between <code>docker0</code> and the outside world works.</p>

          <pre><code># View the container's active TCP connections (only its own)
sudo nsenter -t \${NGINX_PID} --net ss -tlnp
# State  Recv-Q  Send-Q  Local Address:Port
# LISTEN 0       511           0.0.0.0:80</code></pre>

          <h2>6. user — User namespace</h2>

          <p><strong>Flag:</strong> <code>CLONE_NEWUSER</code> — the most powerful and most complex. Isolates UIDs and GIDs, allowing identities to be mapped between the namespace and the host.</p>

          <p>The critical capability: a process can be UID 0 (root) <em>inside</em> the namespace but map to an unprivileged UID on the host. This is the foundation of <strong>rootless</strong> containers.</p>

          <pre><code># Create a user namespace without needing sudo
unshare --user --map-root-user bash

# Inside: we are root
id
# uid=0(root) gid=0(root) groups=0(root),...

# The kernel maps that internal UID 0 to our real UID on the host
cat /proc/self/uid_map
# 0  1000  1   ← UID 0 in namespace = UID 1000 on host</code></pre>

          <p>The <code>/proc/self/uid_map</code> file has the format: <code>&lt;namespace-start-uid&gt; &lt;host-start-uid&gt; &lt;count&gt;</code>. In this case there is only one mapping: UID 0 in the namespace corresponds to UID 1000 on the host.</p>

          <p>Docker <strong>does not enable</strong> the user namespace by default because it historically had compatibility issues with some images. When the container's UID 0 equals the host's UID 0, a container escape lands you as real root. With <code>--userns-remap</code> in the Docker daemon or by using Podman (which is rootless by default), that risk disappears:</p>

          <pre><code># Check whether Docker uses user namespaces
docker info | grep "Security Options" -A5
# Seccomp, AppArmor... but no userns by default

# With Podman (natively rootless):
podman run --rm alpine id
# uid=0(root) gid=0(root)  ← root inside the container

podman run --rm alpine cat /proc/self/uid_map
# 0  100000  65536  ← UID 0 → UID 100000 on the host</code></pre>

          <h2>7. cgroup — Cgroup namespace</h2>

          <p><strong>Flag:</strong> <code>CLONE_NEWCGROUP</code> — virtualizes the view of the <code>/sys/fs/cgroup</code> filesystem for the process.</p>

          <p>Without this namespace, a process inside a container could read the entire cgroup hierarchy of the host — including those of other containers, with their resource limits and metrics. With it, the process sees its own cgroup as if it were the root:</p>

          <pre><code># On the host: nginx's real cgroup is a long path
cat /proc/\${NGINX_PID}/cgroup
# 0::/system.slice/docker-eb4982ca6e37...fab.scope

# Inside the container: sees "/" as its cgroup root
docker exec demo cat /proc/1/cgroup
# 0::/</code></pre>

          <p>This has two benefits: privacy (the container cannot discover other containers via their cgroups) and simplicity for tools that read <code>/proc/self/cgroup</code> to auto-detect their resource limits.</p>

          <h2>8. time — Time namespace</h2>

          <p><strong>Flag:</strong> <code>CLONE_NEWTIME</code> — the newest (Linux 5.6, 2020). Isolates two specific clocks: <code>CLOCK_MONOTONIC</code> and <code>CLOCK_BOOTTIME</code>.</p>

          <p>It allows adjusting the offset of those clocks for a process without affecting the system. The wall clock (<code>CLOCK_REALTIME</code>) <em>cannot</em> be isolated — doing so would be dangerous for system time synchronization.</p>

          <pre><code># Create a time namespace with CLOCK_MONOTONIC offset 1 hour behind
# (requires kernel >= 5.6)
sudo unshare --time --monotonic-offset=-3600 bash

# The monotonic time inside is 3600 seconds behind the host
cat /proc/self/timens_offsets
# monotonic  -3600  0
# boottime   -3600  0</code></pre>

          <p>Main use cases: testing time-sensitive code (simulating that the system has been running for N hours), live migration of containers between hosts (preserving monotonic time for active timeouts and TTLs), and CI environments that need timestamp reproducibility.</p>

          <p>Docker <strong>does not create</strong> a time namespace by default — it appears in <code>lsns</code> pointing to PID 1 on the host, just like <code>user</code>.</p>

          <h2>Namespaces as files: the mechanism that ties everything together</h2>

          <p>Each namespace exists as a file in <code>/proc/&lt;pid&gt;/ns/</code>. As long as that file is open — by any process or file descriptor — the namespace persists even if no process is inside it:</p>

          <pre><code>ls -la /proc/\${NGINX_PID}/ns/

dr-x--x--x 2 root root 0 mar 26 09:16 .
dr-xr-xr-x 9 root root 0 mar 26 09:16 ..
lrwxrwxrwx 1 root root 0 mar 26 09:17 cgroup -> 'cgroup:[4026535754]'
lrwxrwxrwx 1 root root 0 mar 26 09:17 ipc -> 'ipc:[4026535752]'
lrwxrwxrwx 1 root root 0 mar 26 09:16 mnt -> 'mnt:[4026535750]'
lrwxrwxrwx 1 root root 0 mar 26 09:16 net -> 'net:[4026535755]'
lrwxrwxrwx 1 root root 0 mar 26 09:17 pid -> 'pid:[4026535753]'
lrwxrwxrwx 1 root root 0 mar 26 09:19 pid_for_children -> 'pid:[4026535753]'
lrwxrwxrwx 1 root root 0 mar 26 09:17 time -> 'time:[4026531834]'
lrwxrwxrwx 1 root root 0 mar 26 09:19 time_for_children -> 'time:[4026531834]'
lrwxrwxrwx 1 root root 0 mar 26 09:17 user -> 'user:[4026531837]'
lrwxrwxrwx 1 root root 0 mar 26 09:17 uts -> 'uts:[4026535751]'</code></pre>

          <p>Two processes sharing the same inode share the same namespace. This is exactly how <code>docker exec</code> works: it uses <code>setns()</code> to join the container's namespaces before executing the command:</p>

          <pre><code># nsenter does the same thing as docker exec, manually
sudo nsenter -t \${NGINX_PID} --pid --net --mnt --uts --ipc bash

# You are now inside all of the container's namespaces
hostname    # the container's hostname
ip addr     # the container's network
ps aux      # the container's processes</code></pre>

          <p>The <code>pid_for_children</code> / <code>time_for_children</code> pair indicates the namespace that child processes created from this point will <em>inherit</em>. It normally points to the same namespace as <code>pid</code> / <code>time</code>, but may differ if the process is in the middle of a namespace transition.</p>
        `,
        },
      },
      {
        order: 3,
        slug: "capabilities",
        title: {
          es: "Linux Capabilities: rompiendo el binario root/no-root",
          en: "Linux Capabilities: Breaking the root/non-root Binary",
        },
        content: {
          es: `
          <p>Históricamente, Unix tenía un modelo de privilegios binario: o eres root (todo permitido) o no lo eres. Este modelo es demasiado tosco — un servidor web solo necesita escuchar en el puerto 80, no formatear discos ni cargar módulos del kernel.</p>

          <p>Linux rompió esto en la versión 2.2 con las <strong>capabilities</strong>: una lista de ~40 privilegios discretos que pueden concederse o revocarse de forma independiente. En lugar de darle a un proceso todas las llaves del reino, le das solo las que necesita.</p>

          <h2>Capabilities relevantes</h2>

          <pre><code>CAP_NET_BIND_SERVICE  # Bind en puertos < 1024
CAP_NET_RAW           # Sockets raw (ping, tcpdump)
CAP_SYS_ADMIN         # El "catch-all": mount, setns, ptrace... (evitar)
CAP_CHOWN             # Cambiar dueño de archivos
CAP_KILL              # Enviar señales a procesos de otros usuarios
CAP_SETUID / SETGID   # Cambiar UID/GID del proceso
CAP_SYS_PTRACE        # Depurar otros procesos
CAP_NET_ADMIN         # Configurar interfaces de red
CAP_SYS_MODULE        # Cargar módulos del kernel</code></pre>

          <h2>Las capabilities por defecto de Docker</h2>

          <p>Docker arranca los contenedores con un subconjunto reducido y opinado. Para verlo:</p>

          <pre><code>docker run --rm -it alpine sh -c "apk add -q libcap && capsh --print"</code></pre>

          <pre><code>Current: cap_chown,cap_dac_override,cap_fowner,cap_fsetid,
         cap_kill,cap_setgid,cap_setuid,cap_setpcap,
         cap_net_bind_service,cap_net_raw,cap_sys_chroot,
         cap_mknod,cap_audit_write,cap_setfcap=ep
Bounding set: (mismo conjunto)
Securebits: 00/0x0/1'b0</code></pre>

          <p>Las peligrosas están fuera: <code>CAP_SYS_ADMIN</code>, <code>CAP_SYS_PTRACE</code>, <code>CAP_NET_ADMIN</code>, <code>CAP_SYS_MODULE</code>. Esto significa que incluso siendo UID 0 dentro del contenedor, no puedes montar filesystems arbitrarios, cargar módulos del kernel ni depurar procesos de otros namespaces.</p>

          <h2>Agregar y quitar capabilities</h2>

          <pre><code># Agregar: permite hacer ping sin ser root
docker run --rm --cap-add NET_RAW alpine ping -c1 8.8.8.8

# Quitar: nginx que no puede cambiar dueños de archivos
docker run --rm --cap-drop CHOWN nginx:alpine

# Modo mínimo: sin ninguna capability
docker run --rm --cap-drop ALL alpine sh</code></pre>

          <h2>Los cinco conjuntos de capabilities</h2>

          <p>Cada proceso mantiene cinco conjuntos independientes:</p>

          <ul>
            <li><strong>Permitted</strong>: las que el proceso <em>puede</em> activar.</li>
            <li><strong>Effective</strong>: las que están <em>activas ahora</em> (el kernel las verifica en cada syscall).</li>
            <li><strong>Inheritable</strong>: las que pueden heredar los procesos hijos al ejecutar un <code>execve()</code>.</li>
            <li><strong>Bounding</strong>: el techo máximo — ninguna capability fuera de este set puede entrar a Permitted.</li>
            <li><strong>Ambient</strong>: heredadas por procesos hijos que no son privilegiados (Linux 4.3+).</li>
          </ul>

          <p>El conjunto que importa para el control de acceso en tiempo real es <code>Effective</code>. Puedes inspeccionarlo directamente en procfs:</p>

          <pre><code>NGINX_PID=$(pgrep --oldest nginx)
cat /proc/\${NGINX_PID}/status | grep Cap

CapInh: 0000000000000000
CapPrm: 00000000a80425fb
CapEff: 00000000a80425fb
CapBnd: 00000000a80425fb
CapAmb: 0000000000000000</code></pre>

          <pre><code># Decodificar el valor hexadecimal a nombres legibles
capsh --decode=00000000a80425fb

0x00000000a80425fb=cap_chown,cap_dac_override,cap_fowner,cap_fsetid,
cap_kill,cap_setgid,cap_setuid,cap_setpcap,cap_net_bind_service,
cap_net_raw,cap_sys_chroot,cap_mknod,cap_audit_write,cap_setfcap</code></pre>

          <h2>Por qué root en un contenedor sigue siendo peligroso</h2>

          <p>Docker no usa el namespace <code>user</code> por defecto. Eso significa que el UID 0 del contenedor mapea directamente al UID 0 del host. Si un proceso escapa del contenedor (por una vulnerabilidad en el runtime o en el kernel), llega al host como root real.</p>

          <p>Las capabilities mitigan esto parcialmente — sin <code>CAP_SYS_ADMIN</code> hay menos vectores de escape — pero la mitigación completa requiere activar el namespace <code>user</code> (modo rootless) o usar un runtime con mayor aislamiento como <code>gVisor</code> o <code>kata-containers</code>.</p>

          <pre><code># Contenedor rootless: el UID 0 del contenedor mapea a un UID no privilegiado del host
docker run --rm --user 1000:1000 alpine id
# uid=1000 gid=1000

# Verificar el mapeo de UIDs del namespace user
cat /proc/\${NGINX_PID}/uid_map
# 0  1000  1  ← UID 0 del contenedor = UID 1000 del host</code></pre>
        `,
          en: `
          <p>Historically, Unix had a binary privilege model: either you are root (everything allowed) or you are not. This model is too coarse-grained — a web server only needs to listen on port 80, not format disks or load kernel modules.</p>

          <p>Linux broke this in version 2.2 with <strong>capabilities</strong>: a list of ~40 discrete privileges that can be granted or revoked independently. Instead of giving a process all the keys to the kingdom, you give it only the ones it needs.</p>

          <h2>Relevant capabilities</h2>

          <pre><code>CAP_NET_BIND_SERVICE  # Bind to ports < 1024
CAP_NET_RAW           # Raw sockets (ping, tcpdump)
CAP_SYS_ADMIN         # The "catch-all": mount, setns, ptrace... (avoid)
CAP_CHOWN             # Change file ownership
CAP_KILL              # Send signals to other users' processes
CAP_SETUID / SETGID   # Change the process UID/GID
CAP_SYS_PTRACE        # Debug other processes
CAP_NET_ADMIN         # Configure network interfaces
CAP_SYS_MODULE        # Load kernel modules</code></pre>

          <h2>Docker's default capabilities</h2>

          <p>Docker starts containers with a reduced, opinionated subset. To inspect it:</p>

          <pre><code>docker run --rm -it alpine sh -c "apk add -q libcap && capsh --print"</code></pre>

          <pre><code>Current: cap_chown,cap_dac_override,cap_fowner,cap_fsetid,
         cap_kill,cap_setgid,cap_setuid,cap_setpcap,
         cap_net_bind_service,cap_net_raw,cap_sys_chroot,
         cap_mknod,cap_audit_write,cap_setfcap=ep
Bounding set: (same set)
Securebits: 00/0x0/1'b0</code></pre>

          <p>The dangerous ones are excluded: <code>CAP_SYS_ADMIN</code>, <code>CAP_SYS_PTRACE</code>, <code>CAP_NET_ADMIN</code>, <code>CAP_SYS_MODULE</code>. This means that even as UID 0 inside the container, you cannot mount arbitrary filesystems, load kernel modules, or debug processes in other namespaces.</p>

          <h2>Adding and dropping capabilities</h2>

          <pre><code># Add: allows ping without being root
docker run --rm --cap-add NET_RAW alpine ping -c1 8.8.8.8

# Drop: nginx that cannot change file ownership
docker run --rm --cap-drop CHOWN nginx:alpine

# Minimal mode: no capabilities at all
docker run --rm --cap-drop ALL alpine sh</code></pre>

          <h2>The five capability sets</h2>

          <p>Each process maintains five independent sets:</p>

          <ul>
            <li><strong>Permitted</strong>: the capabilities the process <em>can</em> activate.</li>
            <li><strong>Effective</strong>: the capabilities that are <em>currently active</em> (the kernel checks these on every syscall).</li>
            <li><strong>Inheritable</strong>: capabilities that child processes can inherit when executing an <code>execve()</code>.</li>
            <li><strong>Bounding</strong>: the maximum ceiling — no capability outside this set can enter Permitted.</li>
            <li><strong>Ambient</strong>: inherited by unprivileged child processes (Linux 4.3+).</li>
          </ul>

          <p>The set that matters for real-time access control is <code>Effective</code>. You can inspect it directly in procfs:</p>

          <pre><code>NGINX_PID=$(pgrep --oldest nginx)
cat /proc/\${NGINX_PID}/status | grep Cap

CapInh: 0000000000000000
CapPrm: 00000000a80425fb
CapEff: 00000000a80425fb
CapBnd: 00000000a80425fb
CapAmb: 0000000000000000</code></pre>

          <pre><code># Decode the hex value to human-readable names
capsh --decode=00000000a80425fb

0x00000000a80425fb=cap_chown,cap_dac_override,cap_fowner,cap_fsetid,
cap_kill,cap_setgid,cap_setuid,cap_setpcap,cap_net_bind_service,
cap_net_raw,cap_sys_chroot,cap_mknod,cap_audit_write,cap_setfcap</code></pre>

          <h2>Why root inside a container is still dangerous</h2>

          <p>Docker does not use the <code>user</code> namespace by default. That means the container's UID 0 maps directly to UID 0 on the host. If a process escapes the container (through a vulnerability in the runtime or kernel), it lands on the host as real root.</p>

          <p>Capabilities partially mitigate this — without <code>CAP_SYS_ADMIN</code> there are fewer escape vectors — but full mitigation requires enabling the <code>user</code> namespace (rootless mode) or using a runtime with stronger isolation such as <code>gVisor</code> or <code>kata-containers</code>.</p>

          <pre><code># Rootless container: the container's UID 0 maps to an unprivileged host UID
docker run --rm --user 1000:1000 alpine id
# uid=1000 gid=1000

# Verify the UID mapping of the user namespace
cat /proc/\${NGINX_PID}/uid_map
# 0  1000  1  ← container UID 0 = host UID 1000</code></pre>
        `,
        },
      },
      {
        order: 4,
        slug: "chroot-pivot-root",
        title: {
          es: "chroot y pivot_root: cambiando la raíz del filesystem",
          en: "chroot and pivot_root: Changing the Filesystem Root",
        },
        content: {
          es: `
          <p>El aislamiento de red y procesos que dan los namespaces no sirve de nada si el proceso puede leer <code>/etc/shadow</code> del host o modificar binarios del sistema. Para aislar el filesystem necesitamos cambiar lo que el proceso considera su directorio raíz (<code>/</code>). Linux ofrece dos mecanismos para esto: <code>chroot</code> y <code>pivot_root</code>.</p>

          <h2>chroot: el mecanismo clásico</h2>

          <p><code>chroot(2)</code> es una syscall que cambia el directorio raíz del proceso (y sus hijos) a un directorio arbitrario. Existe desde Unix v7 (1979). Su uso es simple:</p>

          <pre><code># Preparar un rootfs mínimo con Alpine
mkdir /tmp/rootfs
docker export $(docker create alpine) | tar -xC /tmp/rootfs

# Entrar con chroot
sudo chroot /tmp/rootfs /bin/sh

# Dentro del chroot:
ls /          # Ve el rootfs de Alpine, no el del host
cat /etc/os-release  # Alpine Linux</code></pre>

          <p>El proceso cree que <code>/tmp/rootfs</code> es su <code>/</code>. No puede navegar "arriba" con <code>cd /../../../</code> — el kernel bloquea esa travesía.</p>

          <h2>El problema de chroot: no es seguro</h2>

          <p><code>chroot</code> tiene una limitación crítica: <strong>un proceso con <code>CAP_SYS_CHROOT</code> puede escapar</strong>. El ataque clásico:</p>

          <pre><code># Dentro del chroot, siendo root:
mkdir -p /tmp/escape
chroot /tmp/escape /bin/sh  # Nuevo chroot vacío
cd ../../../../../../../    # Navegar hacia arriba
# Ahora estás fuera del chroot original</code></pre>

          <p>Además, <code>chroot</code> solo aisla el filesystem. Los procesos del host siguen visibles (<code>ps aux</code> muestra todo), la red es compartida, y los mounts del host siguen accesibles si el atacante sabe cómo montarlos.</p>

          <h2>pivot_root: el mecanismo de producción</h2>

          <p><code>pivot_root(2)</code> hace algo más robusto: intercambia el directorio raíz actual con uno nuevo, moviendo el antiguo raíz a un directorio especificado. A diferencia de <code>chroot</code>, opera a nivel de mount namespace — el resultado es un cambio real en la tabla de montajes, no solo en el puntero de directorio raíz del proceso.</p>

          <pre><code># El flujo que usa runc:
# 1. Crear un nuevo mount namespace
# 2. Montar el rootfs del contenedor como un bind mount
# 3. Usar pivot_root para hacer ese mount el nuevo /
# 4. Desmontar el viejo / (ahora en /.old_root)
# 5. Hacer rmdir de /.old_root

# Demostración manual:
sudo unshare --mount bash

# Dentro del nuevo mount namespace:
mkdir -p /tmp/newroot/.old_root
mount --bind /tmp/rootfs /tmp/newroot
cd /tmp/newroot
pivot_root . .old_root

# Ahora / es el nuevo rootfs
ls /          # Alpine
ls /.old_root # El filesystem original del host

# Desmontar el viejo root (cortar el acceso)
umount -l /.old_root
rmdir /.old_root

ls /          # Solo Alpine. El host desapareció.</code></pre>

          <h2>Por qué pivot_root es superior a chroot</h2>

          <table>
            <thead>
              <tr><th></th><th>chroot</th><th>pivot_root</th></tr>
            </thead>
            <tbody>
              <tr><td>Nivel de operación</td><td>Puntero de directorio raíz del proceso</td><td>Tabla de montajes del namespace</td></tr>
              <tr><td>El viejo / sigue montado</td><td>Sí (accesible con el truco)</td><td>No (se desmonta explícitamente)</td></tr>
              <tr><td>Requiere mount namespace</td><td>No</td><td>Sí (necesario para aislar)</td></tr>
              <tr><td>Escapable con CAP_SYS_CHROOT</td><td>Sí</td><td>No</td></tr>
              <tr><td>Usado en producción</td><td>Solo entornos legacy</td><td>runc, containerd, todos los runtimes OCI</td></tr>
            </tbody>
          </table>

          <h2>Lo que hace runc en la práctica</h2>

          <p>El código de <code>runc</code> (el runtime OCI de referencia) usa <code>pivot_root</code> cuando está disponible, y solo cae a <code>chroot</code> como fallback en entornos muy restrictivos. La secuencia real en pseudocódigo:</p>

          <pre><code>// 1. Crear mount namespace
clone(CLONE_NEWNS)

// 2. Montar el bundle del contenedor
mount(bundlePath, containerRoot, MS_BIND|MS_REC)

// 3. Montar /proc, /dev, /sys del contenedor
mount("proc", containerRoot+"/proc", "proc", ...)
mount("tmpfs", containerRoot+"/dev", "tmpfs", ...)

// 4. pivot_root
chdir(containerRoot)
pivot_root(".", ".old_root")
chdir("/")

// 5. Limpiar el viejo root
umount2(".old_root", MNT_DETACH)
rmdir(".old_root")

// 6. Ahora el proceso vive completamente en el rootfs del contenedor</code></pre>

          <p>El resultado es que el proceso no tiene ninguna referencia al filesystem del host. Ni siquiera un file descriptor abierto puede usarse para navegar al sistema de archivos original.</p>
        `,
          en: `
          <p>The network and process isolation provided by namespaces is useless if the process can read <code>/etc/shadow</code> from the host or modify system binaries. To isolate the filesystem we need to change what the process considers its root directory (<code>/</code>). Linux provides two mechanisms for this: <code>chroot</code> and <code>pivot_root</code>.</p>

          <h2>chroot: the classic mechanism</h2>

          <p><code>chroot(2)</code> is a syscall that changes the root directory of a process (and its children) to an arbitrary directory. It has existed since Unix v7 (1979). Its usage is straightforward:</p>

          <pre><code># Prepare a minimal rootfs with Alpine
mkdir /tmp/rootfs
docker export $(docker create alpine) | tar -xC /tmp/rootfs

# Enter with chroot
sudo chroot /tmp/rootfs /bin/sh

# Inside the chroot:
ls /          # Sees the Alpine rootfs, not the host's
cat /etc/os-release  # Alpine Linux</code></pre>

          <p>The process believes <code>/tmp/rootfs</code> is its <code>/</code>. It cannot navigate "up" with <code>cd /../../../</code> — the kernel blocks that traversal.</p>

          <h2>The problem with chroot: it is not secure</h2>

          <p><code>chroot</code> has a critical limitation: <strong>a process with <code>CAP_SYS_CHROOT</code> can escape</strong>. The classic attack:</p>

          <pre><code># Inside the chroot, as root:
mkdir -p /tmp/escape
chroot /tmp/escape /bin/sh  # New empty chroot
cd ../../../../../../../    # Navigate upward
# You are now outside the original chroot</code></pre>

          <p>Furthermore, <code>chroot</code> only isolates the filesystem. Host processes are still visible (<code>ps aux</code> shows everything), the network is shared, and host mounts remain accessible if the attacker knows how to mount them.</p>

          <h2>pivot_root: the production mechanism</h2>

          <p><code>pivot_root(2)</code> does something more robust: it swaps the current root directory with a new one, moving the old root to a specified directory. Unlike <code>chroot</code>, it operates at the mount namespace level — the result is a real change in the mount table, not just in the process's root directory pointer.</p>

          <pre><code># The flow used by runc:
# 1. Create a new mount namespace
# 2. Mount the container rootfs as a bind mount
# 3. Use pivot_root to make that mount the new /
# 4. Unmount the old / (now at /.old_root)
# 5. rmdir /.old_root

# Manual demonstration:
sudo unshare --mount bash

# Inside the new mount namespace:
mkdir -p /tmp/newroot/.old_root
mount --bind /tmp/rootfs /tmp/newroot
cd /tmp/newroot
pivot_root . .old_root

# Now / is the new rootfs
ls /          # Alpine
ls /.old_root # The original host filesystem

# Unmount the old root (cut off access)
umount -l /.old_root
rmdir /.old_root

ls /          # Only Alpine. The host is gone.</code></pre>

          <h2>Why pivot_root is superior to chroot</h2>

          <table>
            <thead>
              <tr><th></th><th>chroot</th><th>pivot_root</th></tr>
            </thead>
            <tbody>
              <tr><td>Level of operation</td><td>Process root directory pointer</td><td>Namespace mount table</td></tr>
              <tr><td>Old / remains mounted</td><td>Yes (accessible with the trick)</td><td>No (explicitly unmounted)</td></tr>
              <tr><td>Requires mount namespace</td><td>No</td><td>Yes (necessary for isolation)</td></tr>
              <tr><td>Escapable with CAP_SYS_CHROOT</td><td>Yes</td><td>No</td></tr>
              <tr><td>Used in production</td><td>Legacy environments only</td><td>runc, containerd, all OCI runtimes</td></tr>
            </tbody>
          </table>

          <h2>What runc does in practice</h2>

          <p>The <code>runc</code> source code (the reference OCI runtime) uses <code>pivot_root</code> when available, falling back to <code>chroot</code> only in highly restricted environments. The actual sequence in pseudocode:</p>

          <pre><code>// 1. Create mount namespace
clone(CLONE_NEWNS)

// 2. Mount the container bundle
mount(bundlePath, containerRoot, MS_BIND|MS_REC)

// 3. Mount /proc, /dev, /sys for the container
mount("proc", containerRoot+"/proc", "proc", ...)
mount("tmpfs", containerRoot+"/dev", "tmpfs", ...)

// 4. pivot_root
chdir(containerRoot)
pivot_root(".", ".old_root")
chdir("/")

// 5. Clean up the old root
umount2(".old_root", MNT_DETACH)
rmdir(".old_root")

// 6. The process now lives entirely inside the container rootfs</code></pre>

          <p>The result is that the process has no reference whatsoever to the host filesystem. Not even an open file descriptor can be used to navigate back to the original file system.</p>
        `,
        },
      },
      {
        order: 5,
        slug: "overlayfs",
        title: {
          es: "OverlayFS: el filesystem de capas de las imágenes",
          en: "OverlayFS: The Layered Filesystem Behind Container Images",
        },
        content: {
          es: `
          <p>Una imagen de Docker no es un archivo monolítico. Es una pila de capas de solo lectura. Cuando arrancas un contenedor, el runtime añade una capa de lectura-escritura encima. Todo esto es <strong>OverlayFS</strong>, un filesystem de unión incluido en el kernel desde la versión 3.18.</p>

          <h2>Los cuatro directorios de OverlayFS</h2>

          <pre><code>lowerdir  → capas de solo lectura (la imagen)
upperdir  → capa de lectura-escritura (cambios del contenedor)
workdir   → directorio de trabajo interno (mismo filesystem que upper)
merged    → el punto de montaje que ve el proceso</code></pre>

          <h2>Montando un overlay a mano</h2>

          <pre><code>mkdir -p /tmp/overlay/{lower,upper,work,merged}

# Contenido base en la capa inferior
echo "archivo original" > /tmp/overlay/lower/archivo.txt
echo "solo en lower"   > /tmp/overlay/lower/lower-only.txt

# Montar el overlay
sudo mount -t overlay overlay \\
  -o lowerdir=/tmp/overlay/lower,\\
     upperdir=/tmp/overlay/upper,\\
     workdir=/tmp/overlay/work \\
  /tmp/overlay/merged</code></pre>

          <pre><code># Desde merged ves todo
cat /tmp/overlay/merged/archivo.txt     # "archivo original"
cat /tmp/overlay/merged/lower-only.txt  # "solo en lower"

# Modificas un archivo
echo "modificado" > /tmp/overlay/merged/archivo.txt

# El original en lower NO cambió
cat /tmp/overlay/lower/archivo.txt   # "archivo original"

# La copia modificada está en upper (copy-on-write)
cat /tmp/overlay/upper/archivo.txt   # "modificado"</code></pre>

          <h2>Copy-on-write (CoW)</h2>

          <p>El archivo original nunca se toca. Al modificarlo, el kernel copia el bloque completo al <code>upperdir</code> y aplica el cambio ahí. La capa inferior permanece inmutable — lo que permite que múltiples contenedores compartan las mismas capas de imagen sin interferirse.</p>

          <p>Al eliminar un archivo de <code>lowerdir</code>, OverlayFS crea un <strong>whiteout</strong> en <code>upperdir</code>: un archivo de dispositivo de caracteres con major/minor 0,0 que actúa como "este archivo no existe":</p>

          <pre><code>rm /tmp/overlay/merged/lower-only.txt

ls -la /tmp/overlay/upper/
# c--------- 1 root root 0, 0 lower-only.txt  ← char device 0,0 = whiteout</code></pre>

          <h2>La configuración real de un contenedor Docker</h2>

          <pre><code>docker inspect demo | jq '.[0].GraphDriver'

{
  "Data": {
    "ID": "eb4982ca6e37f2c95ad5412c20e45a9b2c54b3f22c6e31513989bca7e5806fab",
    "LowerDir": "/var/lib/docker/overlay2/1629751375ad26b1a67d2cc9008985d421f2b48efe2b1990e94d2661a105dc79-init/diff:/var/lib/docker/overlay2/e30fade0c171491f998205340eea35c3d6feb2870c3da11602fea5e4eb592587/diff:/var/lib/docker/overlay2/60950e861baa6ad9a6fe59f71935f5c3f0d9457908547d35754d075bcbcee056/diff:/var/lib/docker/overlay2/957a97e1c487c04e116095368e478717b60bf2dff4acfea16c779fa9a7c453b3/diff:/var/lib/docker/overlay2/ab385398c1d6e6adcb340bc60f726644090a14e41c62b5ae6168db40594b6b9e/diff:/var/lib/docker/overlay2/0fe27ae5fe60703cf59b79ce1544c0cf5435768b13c383773dee6f4f8dae5099/diff:/var/lib/docker/overlay2/c97f8b48a1cc267f04d1d907cf0c2ec703f35d6a429b97e19914b5cbf186f85c/diff:/var/lib/docker/overlay2/86fe8cf33e603677274ce2bb98da06b5726a03e9b846d3f8897440619afa580d/diff:/var/lib/docker/overlay2/86efbbb5fd4fd3007e78af94c3bcdc247e68b30ac81b247b48890971ece5dc17/diff",
    "MergedDir": "/var/lib/docker/overlay2/1629751375ad26b1a67d2cc9008985d421f2b48efe2b1990e94d2661a105dc79/merged",
    "UpperDir": "/var/lib/docker/overlay2/1629751375ad26b1a67d2cc9008985d421f2b48efe2b1990e94d2661a105dc79/diff",
    "WorkDir": "/var/lib/docker/overlay2/1629751375ad26b1a67d2cc9008985d421f2b48efe2b1990e94d2661a105dc79/work"
  },
  "Name": "overlay2"
}</code></pre>

          <p>El <code>LowerDir</code> tiene 9 entradas separadas por <code>:</code> — cada una es una capa de la imagen nginx, ordenadas de más reciente a más antigua. Son inmutables y se comparten entre todos los contenedores que usen la misma imagen. Solo el <code>UpperDir</code> es único por contenedor.</p>

          <h2>La capa -init</h2>

          <p>Nótese la capa con sufijo <code>-init</code> al inicio del <code>LowerDir</code>. Docker la inserta entre la imagen y el <code>upperdir</code> del contenedor. Contiene archivos que Docker gestiona y que no deben persistir entre recreaciones del contenedor: <code>/etc/hostname</code>, <code>/etc/hosts</code>, <code>/etc/resolv.conf</code>. Es la capa que hace que cada contenedor tenga su propio hostname sin modificar la imagen base.</p>
        `,
          en: `
          <p>A Docker image is not a monolithic file. It is a stack of read-only layers. When you start a container, the runtime adds a read-write layer on top. All of this is <strong>OverlayFS</strong>, a union filesystem included in the kernel since version 3.18.</p>

          <h2>The four OverlayFS directories</h2>

          <pre><code>lowerdir  → read-only layers (the image)
upperdir  → read-write layer (container changes)
workdir   → internal working directory (same filesystem as upper)
merged    → the mount point the process sees</code></pre>

          <h2>Mounting an overlay manually</h2>

          <pre><code>mkdir -p /tmp/overlay/{lower,upper,work,merged}

# Base content in the lower layer
echo "original file" > /tmp/overlay/lower/file.txt
echo "lower only"    > /tmp/overlay/lower/lower-only.txt

# Mount the overlay
sudo mount -t overlay overlay \\
  -o lowerdir=/tmp/overlay/lower,\\
     upperdir=/tmp/overlay/upper,\\
     workdir=/tmp/overlay/work \\
  /tmp/overlay/merged</code></pre>

          <pre><code># From merged you see everything
cat /tmp/overlay/merged/file.txt        # "original file"
cat /tmp/overlay/merged/lower-only.txt  # "lower only"

# Modify a file
echo "modified" > /tmp/overlay/merged/file.txt

# The original in lower did NOT change
cat /tmp/overlay/lower/file.txt   # "original file"

# The modified copy is in upper (copy-on-write)
cat /tmp/overlay/upper/file.txt   # "modified"</code></pre>

          <h2>Copy-on-write (CoW)</h2>

          <p>The original file is never touched. When you modify it, the kernel copies the entire block to the <code>upperdir</code> and applies the change there. The lower layer remains immutable — this is what allows multiple containers to share the same image layers without interfering with each other.</p>

          <p>When you delete a file from <code>lowerdir</code>, OverlayFS creates a <strong>whiteout</strong> in <code>upperdir</code>: a character device file with major/minor 0,0 that acts as "this file does not exist":</p>

          <pre><code>rm /tmp/overlay/merged/lower-only.txt

ls -la /tmp/overlay/upper/
# c--------- 1 root root 0, 0 lower-only.txt  ← char device 0,0 = whiteout</code></pre>

          <h2>The real configuration of a Docker container</h2>

          <pre><code>docker inspect demo | jq '.[0].GraphDriver'

{
  "Data": {
    "ID": "eb4982ca6e37f2c95ad5412c20e45a9b2c54b3f22c6e31513989bca7e5806fab",
    "LowerDir": "/var/lib/docker/overlay2/1629751375ad26b1a67d2cc9008985d421f2b48efe2b1990e94d2661a105dc79-init/diff:/var/lib/docker/overlay2/e30fade0c171491f998205340eea35c3d6feb2870c3da11602fea5e4eb592587/diff:/var/lib/docker/overlay2/60950e861baa6ad9a6fe59f71935f5c3f0d9457908547d35754d075bcbcee056/diff:/var/lib/docker/overlay2/957a97e1c487c04e116095368e478717b60bf2dff4acfea16c779fa9a7c453b3/diff:/var/lib/docker/overlay2/ab385398c1d6e6adcb340bc60f726644090a14e41c62b5ae6168db40594b6b9e/diff:/var/lib/docker/overlay2/0fe27ae5fe60703cf59b79ce1544c0cf5435768b13c383773dee6f4f8dae5099/diff:/var/lib/docker/overlay2/c97f8b48a1cc267f04d1d907cf0c2ec703f35d6a429b97e19914b5cbf186f85c/diff:/var/lib/docker/overlay2/86fe8cf33e603677274ce2bb98da06b5726a03e9b846d3f8897440619afa580d/diff:/var/lib/docker/overlay2/86efbbb5fd4fd3007e78af94c3bcdc247e68b30ac81b247b48890971ece5dc17/diff",
    "MergedDir": "/var/lib/docker/overlay2/1629751375ad26b1a67d2cc9008985d421f2b48efe2b1990e94d2661a105dc79/merged",
    "UpperDir": "/var/lib/docker/overlay2/1629751375ad26b1a67d2cc9008985d421f2b48efe2b1990e94d2661a105dc79/diff",
    "WorkDir": "/var/lib/docker/overlay2/1629751375ad26b1a67d2cc9008985d421f2b48efe2b1990e94d2661a105dc79/work"
  },
  "Name": "overlay2"
}</code></pre>

          <p>The <code>LowerDir</code> has 9 entries separated by <code>:</code> — each is a layer of the nginx image, ordered from most recent to oldest. They are immutable and shared among all containers using the same image. Only the <code>UpperDir</code> is unique per container.</p>

          <h2>The -init layer</h2>

          <p>Note the layer with the <code>-init</code> suffix at the beginning of <code>LowerDir</code>. Docker inserts it between the image and the container's <code>upperdir</code>. It contains files that Docker manages and that should not persist across container recreations: <code>/etc/hostname</code>, <code>/etc/hosts</code>, <code>/etc/resolv.conf</code>. This is the layer that gives each container its own hostname without modifying the base image.</p>
        `,
        },
      },
      {
        order: 6,
        slug: "cgroups",
        title: {
          es: "cgroups: control real de recursos (v1 vs v2)",
          en: "cgroups: Real Resource Control (v1 vs v2)",
        },
        content: {
          es: `
          <p>Los namespaces dan aislamiento: el proceso <em>cree</em> que está solo. Los <strong>cgroups</strong> (control groups) dan control de recursos: cuánto CPU, memoria, I/O puede consumir <em>realmente</em>. Sin cgroups, un contenedor podría consumir todos los recursos del host y matar a sus vecinos.</p>

          <p>Existen dos versiones con arquitecturas fundamentalmente distintas.</p>

          <h2>cgroups v1: jerarquías por subsistema</h2>

          <p>En v1, cada tipo de recurso tiene su propia jerarquía independiente montada en un directorio separado:</p>

          <pre><code>ls /sys/fs/cgroup/

blkio  cpu  cpu,cpuacct  cpuset  devices  freezer
hugetlb  memory  net_cls  net_prio  perf_event  pids  rdma  systemd</code></pre>

          <p>Para limitar memoria de un proceso en v1:</p>

          <pre><code># Crear un cgroup en el subsistema memory
mkdir /sys/fs/cgroup/memory/mi-app

# Establecer límite de 256 MB
echo $((256 * 1024 * 1024)) > /sys/fs/cgroup/memory/mi-app/memory.limit_in_bytes

# Agregar el proceso actual al cgroup
echo $$ > /sys/fs/cgroup/memory/mi-app/cgroup.procs

# Verificar el límite activo
cat /sys/fs/cgroup/memory/mi-app/memory.limit_in_bytes
# 268435456</code></pre>

          <p>El problema de v1 es que la jerarquía de cada subsistema es independiente. Un mismo proceso puede estar en posiciones distintas del árbol en <code>cpu</code>, <code>memory</code> y <code>blkio</code>, lo que hace la gestión compleja, inconsistente y difícil de razonar. La contabilidad entre subsistemas tampoco está coordinada.</p>

          <h2>cgroups v2: jerarquía unificada</h2>

          <p>v2 resuelve esto con un único árbol compartido por todos los controladores:</p>

          <pre><code>ls /sys/fs/cgroup/

cgroup.controllers  cgroup.max.depth  cgroup.procs
cgroup.stat         cgroup.subtree_control
init.scope/  system.slice/  user.slice/</code></pre>

          <p>Para limitar recursos en v2:</p>

          <pre><code># Crear el cgroup
mkdir /sys/fs/cgroup/mi-app

# Habilitar los controladores que quieres usar (en el padre)
echo "+cpu +memory +io" > /sys/fs/cgroup/cgroup.subtree_control

# Límite de memoria: máximo 256MB, sin swap
echo $((256 * 1024 * 1024)) > /sys/fs/cgroup/mi-app/memory.max
echo 0 > /sys/fs/cgroup/mi-app/memory.swap.max

# Límite de CPU: 50% de un core (50000 µs de cada 100000 µs)
echo "50000 100000" > /sys/fs/cgroup/mi-app/cpu.max

# Agregar el proceso
echo $$ > /sys/fs/cgroup/mi-app/cgroup.procs</code></pre>

          <h2>Pressure Stall Information (PSI)</h2>

          <p>v2 introduce PSI: métricas que indican cuánto tiempo los procesos del cgroup estuvieron <em>esperando</em> por CPU, memoria o I/O. Es información de contención que v1 no tenía y que es fundamental para detectar saturación antes de que se convierta en un problema:</p>

          <pre><code>cat /sys/fs/cgroup/mi-app/memory.pressure

some avg10=0.00 avg60=0.00 avg300=0.00 total=0
full avg10=0.00 avg60=0.00 avg300=0.00 total=0</code></pre>

          <ul>
            <li><strong>some</strong>: al menos un proceso esperó por el recurso.</li>
            <li><strong>full</strong>: todos los procesos esperaron (stall total).</li>
            <li><strong>avg10/60/300</strong>: promedio en los últimos 10s, 60s y 300s.</li>
          </ul>

          <h2>Cómo lo usa Docker</h2>

          <pre><code>docker run --name demo-limits --rm -d \\
  --memory=512m \\
  --cpus=0.5 \\
  nginx:alpine

CONTAINER_ID=$(docker inspect demo-limits --format '{{.Id}}')

# Ver el cgroup creado (v2)
cat /sys/fs/cgroup/system.slice/docker-\${CONTAINER_ID}.scope/memory.max
# 536870912  ← 512 * 1024 * 1024

cat /sys/fs/cgroup/system.slice/docker-\${CONTAINER_ID}.scope/cpu.max
# 50000 100000  ← 50% de un core</code></pre>

          <h2>Diferencias clave v1 vs v2</h2>

          <table>
            <thead>
              <tr><th></th><th>cgroups v1</th><th>cgroups v2</th></tr>
            </thead>
            <tbody>
              <tr><td>Arquitectura</td><td>Jerarquía por subsistema</td><td>Árbol único unificado</td></tr>
              <tr><td>Montaje</td><td><code>/sys/fs/cgroup/&lt;subsistema&gt;/</code></td><td><code>/sys/fs/cgroup/</code></td></tr>
              <tr><td>Consistencia</td><td>Posiciones distintas por subsistema</td><td>Una posición en el árbol</td></tr>
              <tr><td>PSI</td><td>No disponible</td><td>Disponible (<code>*.pressure</code>)</td></tr>
              <tr><td>Adopción</td><td>Kernels &lt; 4.5, sistemas legacy</td><td>Por defecto en kernels modernos (Ubuntu 21.10+, RHEL 9+)</td></tr>
            </tbody>
          </table>

          <h2>Relación con Kubernetes</h2>

          <p>Kubernetes usa cgroups para implementar los <code>requests</code> y <code>limits</code> de los Pods:</p>

          <ul>
            <li><code>requests.cpu</code> → <code>cpu.shares</code> (v1) / <code>cpu.weight</code> (v2): un peso relativo que garantiza un mínimo.</li>
            <li><code>limits.cpu</code> → <code>cpu.cfs_quota_us</code> (v1) / <code>cpu.max</code> (v2): un techo duro.</li>
            <li><code>limits.memory</code> → <code>memory.limit_in_bytes</code> (v1) / <code>memory.max</code> (v2): al superarlo, el proceso recibe SIGKILL (OOM kill).</li>
          </ul>
        `,
          en: `
          <p>Namespaces provide isolation: the process <em>believes</em> it is alone. <strong>cgroups</strong> (control groups) provide resource control: how much CPU, memory, and I/O a process can <em>actually</em> consume. Without cgroups, a container could consume all host resources and starve its neighbors.</p>

          <p>There are two versions with fundamentally different architectures.</p>

          <h2>cgroups v1: per-subsystem hierarchies</h2>

          <p>In v1, each resource type has its own independent hierarchy mounted in a separate directory:</p>

          <pre><code>ls /sys/fs/cgroup/

blkio  cpu  cpu,cpuacct  cpuset  devices  freezer
hugetlb  memory  net_cls  net_prio  perf_event  pids  rdma  systemd</code></pre>

          <p>To limit memory for a process in v1:</p>

          <pre><code># Create a cgroup in the memory subsystem
mkdir /sys/fs/cgroup/memory/my-app

# Set a 256 MB limit
echo $((256 * 1024 * 1024)) > /sys/fs/cgroup/memory/my-app/memory.limit_in_bytes

# Add the current process to the cgroup
echo $$ > /sys/fs/cgroup/memory/my-app/cgroup.procs

# Verify the active limit
cat /sys/fs/cgroup/memory/my-app/memory.limit_in_bytes
# 268435456</code></pre>

          <p>The problem with v1 is that each subsystem's hierarchy is independent. The same process can be at different positions in the tree for <code>cpu</code>, <code>memory</code>, and <code>blkio</code>, making management complex, inconsistent, and hard to reason about. Accounting across subsystems is not coordinated either.</p>

          <h2>cgroups v2: unified hierarchy</h2>

          <p>v2 solves this with a single tree shared by all controllers:</p>

          <pre><code>ls /sys/fs/cgroup/

cgroup.controllers  cgroup.max.depth  cgroup.procs
cgroup.stat         cgroup.subtree_control
init.scope/  system.slice/  user.slice/</code></pre>

          <p>To limit resources in v2:</p>

          <pre><code># Create the cgroup
mkdir /sys/fs/cgroup/my-app

# Enable the controllers you want to use (on the parent)
echo "+cpu +memory +io" > /sys/fs/cgroup/cgroup.subtree_control

# Memory limit: maximum 256MB, no swap
echo $((256 * 1024 * 1024)) > /sys/fs/cgroup/my-app/memory.max
echo 0 > /sys/fs/cgroup/my-app/memory.swap.max

# CPU limit: 50% of one core (50000 µs out of every 100000 µs)
echo "50000 100000" > /sys/fs/cgroup/my-app/cpu.max

# Add the process
echo $$ > /sys/fs/cgroup/my-app/cgroup.procs</code></pre>

          <h2>Pressure Stall Information (PSI)</h2>

          <p>v2 introduces PSI: metrics that indicate how long processes in the cgroup were <em>waiting</em> for CPU, memory, or I/O. This is contention information that v1 lacked and that is essential for detecting saturation before it becomes a problem:</p>

          <pre><code>cat /sys/fs/cgroup/my-app/memory.pressure

some avg10=0.00 avg60=0.00 avg300=0.00 total=0
full avg10=0.00 avg60=0.00 avg300=0.00 total=0</code></pre>

          <ul>
            <li><strong>some</strong>: at least one process waited for the resource.</li>
            <li><strong>full</strong>: all processes waited (total stall).</li>
            <li><strong>avg10/60/300</strong>: average over the last 10s, 60s, and 300s.</li>
          </ul>

          <h2>How Docker uses cgroups</h2>

          <pre><code>docker run --name demo-limits --rm -d \\
  --memory=512m \\
  --cpus=0.5 \\
  nginx:alpine

CONTAINER_ID=$(docker inspect demo-limits --format '{{.Id}}')

# View the created cgroup (v2)
cat /sys/fs/cgroup/system.slice/docker-\${CONTAINER_ID}.scope/memory.max
# 536870912  ← 512 * 1024 * 1024

cat /sys/fs/cgroup/system.slice/docker-\${CONTAINER_ID}.scope/cpu.max
# 50000 100000  ← 50% of one core</code></pre>

          <h2>Key differences v1 vs v2</h2>

          <table>
            <thead>
              <tr><th></th><th>cgroups v1</th><th>cgroups v2</th></tr>
            </thead>
            <tbody>
              <tr><td>Architecture</td><td>Per-subsystem hierarchy</td><td>Single unified tree</td></tr>
              <tr><td>Mount path</td><td><code>/sys/fs/cgroup/&lt;subsystem&gt;/</code></td><td><code>/sys/fs/cgroup/</code></td></tr>
              <tr><td>Consistency</td><td>Different positions per subsystem</td><td>One position in the tree</td></tr>
              <tr><td>PSI</td><td>Not available</td><td>Available (<code>*.pressure</code>)</td></tr>
              <tr><td>Adoption</td><td>Kernels &lt; 4.5, legacy systems</td><td>Default on modern kernels (Ubuntu 21.10+, RHEL 9+)</td></tr>
            </tbody>
          </table>

          <h2>Relationship with Kubernetes</h2>

          <p>Kubernetes uses cgroups to implement Pod <code>requests</code> and <code>limits</code>:</p>

          <ul>
            <li><code>requests.cpu</code> → <code>cpu.shares</code> (v1) / <code>cpu.weight</code> (v2): a relative weight that guarantees a minimum.</li>
            <li><code>limits.cpu</code> → <code>cpu.cfs_quota_us</code> (v1) / <code>cpu.max</code> (v2): a hard ceiling.</li>
            <li><code>limits.memory</code> → <code>memory.limit_in_bytes</code> (v1) / <code>memory.max</code> (v2): when exceeded, the process receives SIGKILL (OOM kill).</li>
          </ul>
        `,
        },
      },
      {
        order: 7,
        slug: "construyendo-un-contenedor",
        title: {
          es: "Construyendo un contenedor desde 0",
          en: "Building a Container from Scratch",
        },
        content: {
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
  --mount \\      # Nuevo namespace de mounts (necesario para pivot_root)
  --mount-proc=/tmp/mycontainer/rootfs/proc \\
  /bin/bash</code></pre>

          <p>Desde aquí, estamos dentro de los namespaces pero todavía con el filesystem del host.</p>

          <h2>Paso 3: pivot_root al rootfs del contenedor</h2>

          <pre><code># Dentro del unshare:

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

# La interfaz lo está ahí pero down
ip addr
# 1: lo: &lt;LOOPBACK&gt; ...

# Levantar loopback
ip link set lo up
ip addr show lo
# 1: lo: &lt;LOOPBACK,UP&gt; ...</code></pre>

          <h2>Paso 6: aplicar límites de recursos con cgroups</h2>

          <p>Desde otra terminal del host (el cgroup se aplica desde fuera):</p>

          <pre><code># Obtener el PID del proceso unshare en el host
CONTAINER_PID=$(pgrep -f "unshare.*mount")

# Crear el cgroup
mkdir /sys/fs/cgroup/mi-contenedor

# Límites
echo $((256 * 1024 * 1024)) > /sys/fs/cgroup/mi-contenedor/memory.max
echo "50000 100000" > /sys/fs/cgroup/mi-contenedor/cpu.max
echo 100 > /sys/fs/cgroup/mi-contenedor/pids.max

# Agregar el proceso
echo \${CONTAINER_PID} > /sys/fs/cgroup/mi-contenedor/cgroup.procs</code></pre>

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
  --mount \\      # New mount namespace (required for pivot_root)
  --mount-proc=/tmp/mycontainer/rootfs/proc \\
  /bin/bash</code></pre>

          <p>From here we are inside the namespaces but still using the host filesystem.</p>

          <h2>Step 3: pivot_root to the container rootfs</h2>

          <pre><code># Inside the unshare:

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

          <h2>Step 6: apply resource limits with cgroups</h2>

          <p>From another terminal on the host (the cgroup is applied from outside):</p>

          <pre><code># Get the PID of the unshare process on the host
CONTAINER_PID=$(pgrep -f "unshare.*mount")

# Create the cgroup
mkdir /sys/fs/cgroup/my-container

# Limits
echo $((256 * 1024 * 1024)) > /sys/fs/cgroup/my-container/memory.max
echo "50000 100000" > /sys/fs/cgroup/my-container/cpu.max
echo 100 > /sys/fs/cgroup/my-container/pids.max

# Add the process
echo \${CONTAINER_PID} > /sys/fs/cgroup/my-container/cgroup.procs</code></pre>

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
        },
      },
      {
        order: 8,
        slug: "container-runtime",
        title: {
          es: "Lo que hace el container runtime",
          en: "What the Container Runtime Does",
        },
        content: {
          es: `
          <p>Cuando ejecutas <code>docker run nginx</code>, la petición pasa por tres capas de software antes de llegar al kernel. Entender estas capas es fundamental para diagnosticar problemas, configurar seguridad y razonar sobre el comportamiento en producción.</p>

          <h2>La arquitectura: Docker → containerd → runc</h2>

          <pre><code>docker run nginx
    │
    ▼
dockerd          ← El daemon de Docker. Gestiona la API, imágenes, redes, volúmenes.
    │  gRPC
    ▼
containerd       ← El container runtime de alto nivel. Gestiona el ciclo de vida.
    │  exec
    ▼
containerd-shim  ← Un proceso intermediario por contenedor. Mantiene stdio abierto.
    │  exec
    ▼
runc             ← El runtime OCI de bajo nivel. Crea el contenedor y sale.
    │  syscalls
    ▼
kernel           ← clone(), pivot_root(), mount(), setgroups()...</code></pre>

          <p><code>runc</code> es el que realmente toca el kernel. Una vez que el contenedor está corriendo, <code>runc</code> sale — el contenedor sigue vivo bajo <code>containerd-shim</code>.</p>

          <h2>El bundle OCI</h2>

          <p>El estándar OCI (Open Container Initiative) define un formato de bundle: un directorio con dos elementos:</p>

          <pre><code>/bundle/
├── config.json   ← Especificación completa del contenedor
└── rootfs/       ← El filesystem raíz</code></pre>

          <p><code>config.json</code> describe todo: qué namespaces crear, qué capabilities tener, los mounts, las variables de entorno, el entrypoint, los cgroups, las reglas de seccomp. Puedes generarlo con:</p>

          <pre><code>mkdir /tmp/bundle && cd /tmp/bundle
docker export $(docker create nginx) | tar -xC rootfs/
runc spec  # Genera un config.json por defecto

# Inspeccionar lo que generó
cat config.json | jq '.process.capabilities'
cat config.json | jq '.linux.namespaces'</code></pre>

          <h2>La secuencia exacta de runc</h2>

          <p>Al ejecutar <code>runc run</code>, el proceso realiza en orden:</p>

          <ol>
            <li><strong>Validar</strong> el bundle OCI (<code>config.json</code> + <code>rootfs/</code>).</li>
            <li><strong>Crear el cgroup</strong> en <code>/sys/fs/cgroup/</code> con los límites especificados.</li>
            <li><strong>Llamar a <code>clone()</code></strong> con los flags de namespace: <code>CLONE_NEWPID | CLONE_NEWNET | CLONE_NEWNS | CLONE_NEWUTS | CLONE_NEWIPC</code>.</li>
            <li>El proceso hijo (en los nuevos namespaces) configura los mounts: bind mounts, <code>/proc</code>, <code>/dev</code>, <code>/sys</code>.</li>
            <li><strong><code>pivot_root</code></strong> al rootfs del contenedor.</li>
            <li><strong>Aplicar capabilities</strong>: droppear las no permitidas del bounding set.</li>
            <li><strong>Aplicar el perfil de seccomp</strong>: filtrar syscalls peligrosas.</li>
            <li><strong>Escribir el PID</strong> en <code>cgroup.procs</code> del cgroup creado en el paso 2.</li>
            <li><strong><code>execve()</code></strong> del entrypoint definido en <code>config.json</code>.</li>
            <li><code>runc</code> sale. El proceso del contenedor queda bajo <code>containerd-shim</code>.</li>
          </ol>

          <h2>Verificando cada paso en vivo</h2>

          <pre><code># Usar strace para ver las syscalls que hace runc
sudo strace -f -e trace=clone,unshare,pivot_root,mount,execve \\
  runc run --bundle /tmp/bundle mi-contenedor 2>&1 | head -50</code></pre>

          <pre><code># Clonar el proceso con los namespace flags
clone(child_stack=NULL, flags=CLONE_NEWPID|CLONE_NEWNET|CLONE_NEWNS|
      CLONE_NEWUTS|CLONE_NEWIPC|SIGCHLD, ...) = 12345

# Montar el rootfs
mount("/tmp/bundle/rootfs", "/tmp/bundle/rootfs", NULL, MS_BIND|MS_REC, NULL)

# pivot_root
pivot_root(".", ".old_root")

# Montar /proc dentro del contenedor
mount("proc", "/proc", "proc", MS_NOSUID|MS_NODEV|MS_NOEXEC, NULL)

# Ejecutar el entrypoint
execve("/docker-entrypoint.sh", ["/docker-entrypoint.sh", "nginx", "-g", "daemon off;"], ...)</code></pre>

          <h2>containerd vs Docker: la distinción que importa</h2>

          <p>Kubernetes no usa Docker. Usa <strong>containerd</strong> directamente (o CRI-O) a través de la Container Runtime Interface (CRI). Docker es solo una capa de conveniencia encima de containerd para uso en desarrollo. En producción con Kubernetes:</p>

          <pre><code>kubelet → CRI → containerd → runc → kernel</code></pre>

          <p>El flujo es más corto y el resultado es idéntico. Cuando Kubernetes crea un Pod, <code>kubelet</code> le pide a <code>containerd</code> que cree los contenedores especificados. <code>containerd</code> llama a <code>runc</code> por cada uno. <code>runc</code> aplica los mismos pasos que describimos arriba.</p>

          <h2>Runtimes alternativos</h2>

          <table>
            <thead>
              <tr><th>Runtime</th><th>Enfoque</th><th>Cuándo usarlo</th></tr>
            </thead>
            <tbody>
              <tr><td><code>runc</code></td><td>Referencia OCI, usa namespaces del host</td><td>Caso general</td></tr>
              <tr><td><code>gVisor (runsc)</code></td><td>Kernel en espacio de usuario (syscall interceptadas)</td><td>Multi-tenancy, workloads no confiables</td></tr>
              <tr><td><code>kata-containers</code></td><td>VM ligera por contenedor</td><td>Aislamiento máximo, cargas sensibles</td></tr>
              <tr><td><code>crun</code></td><td>Compatible con OCI, escrito en C, más rápido</td><td>Alta densidad de contenedores</td></tr>
            </tbody>
          </table>
        `,
          en: `
          <p>When you run <code>docker run nginx</code>, the request passes through three layers of software before reaching the kernel. Understanding these layers is essential for diagnosing problems, configuring security, and reasoning about production behavior.</p>

          <h2>The architecture: Docker → containerd → runc</h2>

          <pre><code>docker run nginx
    │
    ▼
dockerd          ← The Docker daemon. Manages the API, images, networks, volumes.
    │  gRPC
    ▼
containerd       ← The high-level container runtime. Manages the lifecycle.
    │  exec
    ▼
containerd-shim  ← One intermediary process per container. Keeps stdio open.
    │  exec
    ▼
runc             ← The low-level OCI runtime. Creates the container and exits.
    │  syscalls
    ▼
kernel           ← clone(), pivot_root(), mount(), setgroups()...</code></pre>

          <p><code>runc</code> is the one that actually touches the kernel. Once the container is running, <code>runc</code> exits — the container stays alive under <code>containerd-shim</code>.</p>

          <h2>The OCI bundle</h2>

          <p>The OCI (Open Container Initiative) standard defines a bundle format: a directory with two elements:</p>

          <pre><code>/bundle/
├── config.json   ← Complete container specification
└── rootfs/       ← The root filesystem</code></pre>

          <p><code>config.json</code> describes everything: which namespaces to create, which capabilities to have, the mounts, environment variables, the entrypoint, cgroups, and seccomp rules. You can generate it with:</p>

          <pre><code>mkdir /tmp/bundle && cd /tmp/bundle
docker export $(docker create nginx) | tar -xC rootfs/
runc spec  # Generates a default config.json

# Inspect what it generated
cat config.json | jq '.process.capabilities'
cat config.json | jq '.linux.namespaces'</code></pre>

          <h2>The exact runc sequence</h2>

          <p>When executing <code>runc run</code>, the process performs in order:</p>

          <ol>
            <li><strong>Validate</strong> the OCI bundle (<code>config.json</code> + <code>rootfs/</code>).</li>
            <li><strong>Create the cgroup</strong> in <code>/sys/fs/cgroup/</code> with the specified limits.</li>
            <li><strong>Call <code>clone()</code></strong> with the namespace flags: <code>CLONE_NEWPID | CLONE_NEWNET | CLONE_NEWNS | CLONE_NEWUTS | CLONE_NEWIPC</code>.</li>
            <li>The child process (in the new namespaces) configures the mounts: bind mounts, <code>/proc</code>, <code>/dev</code>, <code>/sys</code>.</li>
            <li><strong><code>pivot_root</code></strong> to the container rootfs.</li>
            <li><strong>Apply capabilities</strong>: drop those not permitted from the bounding set.</li>
            <li><strong>Apply the seccomp profile</strong>: filter dangerous syscalls.</li>
            <li><strong>Write the PID</strong> to <code>cgroup.procs</code> of the cgroup created in step 2.</li>
            <li><strong><code>execve()</code></strong> the entrypoint defined in <code>config.json</code>.</li>
            <li><code>runc</code> exits. The container process remains under <code>containerd-shim</code>.</li>
          </ol>

          <h2>Verifying each step live</h2>

          <pre><code># Use strace to observe the syscalls runc makes
sudo strace -f -e trace=clone,unshare,pivot_root,mount,execve \\
  runc run --bundle /tmp/bundle my-container 2>&1 | head -50</code></pre>

          <pre><code># Clone the process with namespace flags
clone(child_stack=NULL, flags=CLONE_NEWPID|CLONE_NEWNET|CLONE_NEWNS|
      CLONE_NEWUTS|CLONE_NEWIPC|SIGCHLD, ...) = 12345

# Mount the rootfs
mount("/tmp/bundle/rootfs", "/tmp/bundle/rootfs", NULL, MS_BIND|MS_REC, NULL)

# pivot_root
pivot_root(".", ".old_root")

# Mount /proc inside the container
mount("proc", "/proc", "proc", MS_NOSUID|MS_NODEV|MS_NOEXEC, NULL)

# Execute the entrypoint
execve("/docker-entrypoint.sh", ["/docker-entrypoint.sh", "nginx", "-g", "daemon off;"], ...)</code></pre>

          <h2>containerd vs Docker: the distinction that matters</h2>

          <p>Kubernetes does not use Docker. It uses <strong>containerd</strong> directly (or CRI-O) through the Container Runtime Interface (CRI). Docker is just a convenience layer on top of containerd for development use. In production with Kubernetes:</p>

          <pre><code>kubelet → CRI → containerd → runc → kernel</code></pre>

          <p>The flow is shorter and the result is identical. When Kubernetes creates a Pod, <code>kubelet</code> asks <code>containerd</code> to create the specified containers. <code>containerd</code> calls <code>runc</code> for each one. <code>runc</code> applies the same steps described above.</p>

          <h2>Alternative runtimes</h2>

          <table>
            <thead>
              <tr><th>Runtime</th><th>Approach</th><th>When to use it</th></tr>
            </thead>
            <tbody>
              <tr><td><code>runc</code></td><td>OCI reference, uses host namespaces</td><td>General purpose</td></tr>
              <tr><td><code>gVisor (runsc)</code></td><td>User-space kernel (intercepted syscalls)</td><td>Multi-tenancy, untrusted workloads</td></tr>
              <tr><td><code>kata-containers</code></td><td>Lightweight VM per container</td><td>Maximum isolation, sensitive workloads</td></tr>
              <tr><td><code>crun</code></td><td>OCI-compatible, written in C, faster</td><td>High container density</td></tr>
            </tbody>
          </table>
        `,
        },
      },
      {
        order: 9,
        slug: "resumen",
        title: {
          es: "Resumen de la serie",
          en: "Series Summary",
        },
        content: {
          es: `
          <p>Llegaste al final. Si seguiste la serie completa, ahora tienes un modelo mental preciso de qué es un contenedor — no una metáfora, sino una descripción mecánica de las primitivas del kernel que lo hacen posible.</p>

          <h2>El mapa completo</h2>

          <p>Un contenedor es la composición de:</p>

          <table>
            <thead>
              <tr><th>Mecanismo</th><th>Qué aporta</th><th>Syscall / interfaz</th></tr>
            </thead>
            <tbody>
              <tr><td>Namespaces</td><td>Aislamiento: el proceso cree que está solo</td><td><code>clone()</code>, <code>unshare()</code>, <code>setns()</code></td></tr>
              <tr><td>Capabilities</td><td>Privilegios granulares: no todo o nada</td><td><code>capset()</code>, <code>/proc/&lt;pid&gt;/status</code></td></tr>
              <tr><td>pivot_root</td><td>Filesystem raíz propio, sin acceso al host</td><td><code>pivot_root()</code></td></tr>
              <tr><td>OverlayFS</td><td>Capas de imagen inmutables + capa de escritura</td><td><code>mount()</code> con <code>-t overlay</code></td></tr>
              <tr><td>cgroups</td><td>Control de recursos: CPU, memoria, I/O</td><td><code>/sys/fs/cgroup/</code></td></tr>
              <tr><td>seccomp</td><td>Filtro de syscalls permitidas</td><td><code>prctl(PR_SET_SECCOMP)</code></td></tr>
            </tbody>
          </table>

          <p>El runtime (<code>runc</code>) orquesta todos estos mecanismos en el orden correcto. Docker y containerd son capas de conveniencia encima del runtime.</p>

          <h2>Lo que el kernel no sabe</h2>

          <p>El kernel no tiene concepto de "contenedor". Solo tiene procesos, namespaces, cgroups y mounts. La palabra "contenedor" es una convención de espacio de usuario — una forma de hablar sobre un proceso configurado de una manera particular.</p>

          <p>Esta distinción importa cuando algo falla: los problemas de contenedores son problemas de Linux. Las herramientas de debugging son las mismas: <code>strace</code>, <code>lsns</code>, <code>nsenter</code>, <code>ip</code>, <code>ss</code>, <code>cat /proc/...</code>.</p>

          <h2>Lo que no cubrimos</h2>

          <ul>
            <li><strong>seccomp</strong> — filtrado de syscalls permitidas (el perfil por defecto de Docker bloquea ~40 syscalls).</li>
            <li><strong>AppArmor / SELinux</strong> — MAC (Mandatory Access Control) como capa adicional.</li>
            <li><strong>Rootless containers</strong> — usar el namespace <code>user</code> para eliminar la dependencia de root en el host.</li>
            <li><strong>Image layers y la OCI Image Spec</strong> — cómo se empaquetan y distribuyen las imágenes.</li>
          </ul>

          <h2>Próximos pasos: Pods</h2>

          <p>En la siguiente serie veremos cómo Kubernetes agrupa varios contenedores en un <strong>Pod</strong>. La pregunta clave: si cada contenedor tiene sus propios namespaces, ¿cómo comparten red y filesystem dentro de un Pod?</p>

          <p>La respuesta involucra el <strong>pause container</strong> (también llamado "infra container"), un proceso mínimo que crea los namespaces compartidos del Pod y los mantiene vivos aunque los contenedores de aplicación se reinicien. Cuando <code>kubelet</code> crea un Pod, el primer contenedor que arranca siempre es <code>pause</code> — los demás se unen a sus namespaces.</p>

          <pre><code># Puedes verlo en cualquier nodo de Kubernetes:
crictl ps | grep pause

# O con Docker en modo single-node:
docker ps | grep pause</code></pre>

          <p>Si entendiste esta serie, entender Pods será natural — son exactamente el mismo mecanismo, con namespaces selectivamente compartidos entre procesos.</p>
        `,
          en: `
          <p>You have reached the end. If you followed the complete series, you now have a precise mental model of what a container is — not a metaphor, but a mechanical description of the kernel primitives that make it possible.</p>

          <h2>The complete map</h2>

          <p>A container is a composition of:</p>

          <table>
            <thead>
              <tr><th>Mechanism</th><th>What it provides</th><th>Syscall / interface</th></tr>
            </thead>
            <tbody>
              <tr><td>Namespaces</td><td>Isolation: the process believes it is alone</td><td><code>clone()</code>, <code>unshare()</code>, <code>setns()</code></td></tr>
              <tr><td>Capabilities</td><td>Granular privileges: not all-or-nothing</td><td><code>capset()</code>, <code>/proc/&lt;pid&gt;/status</code></td></tr>
              <tr><td>pivot_root</td><td>Own root filesystem, no access to the host</td><td><code>pivot_root()</code></td></tr>
              <tr><td>OverlayFS</td><td>Immutable image layers + writable layer</td><td><code>mount()</code> with <code>-t overlay</code></td></tr>
              <tr><td>cgroups</td><td>Resource control: CPU, memory, I/O</td><td><code>/sys/fs/cgroup/</code></td></tr>
              <tr><td>seccomp</td><td>Allowed syscall filter</td><td><code>prctl(PR_SET_SECCOMP)</code></td></tr>
            </tbody>
          </table>

          <p>The runtime (<code>runc</code>) orchestrates all these mechanisms in the correct order. Docker and containerd are convenience layers on top of the runtime.</p>

          <h2>What the kernel does not know</h2>

          <p>The kernel has no concept of a "container." It only has processes, namespaces, cgroups, and mounts. The word "container" is a user-space convention — a way of talking about a process configured in a particular way.</p>

          <p>This distinction matters when something fails: container problems are Linux problems. The debugging tools are the same: <code>strace</code>, <code>lsns</code>, <code>nsenter</code>, <code>ip</code>, <code>ss</code>, <code>cat /proc/...</code>.</p>

          <h2>What we did not cover</h2>

          <ul>
            <li><strong>seccomp</strong> — allowed syscall filtering (Docker's default profile blocks ~40 syscalls).</li>
            <li><strong>AppArmor / SELinux</strong> — MAC (Mandatory Access Control) as an additional layer.</li>
            <li><strong>Rootless containers</strong> — using the <code>user</code> namespace to eliminate the dependency on root on the host.</li>
            <li><strong>Image layers and the OCI Image Spec</strong> — how images are packaged and distributed.</li>
          </ul>

          <h2>Next steps: Pods</h2>

          <p>In the next series we will look at how Kubernetes groups multiple containers into a <strong>Pod</strong>. The key question: if each container has its own namespaces, how do they share the network and filesystem inside a Pod?</p>

          <p>The answer involves the <strong>pause container</strong> (also called the "infra container"), a minimal process that creates the Pod's shared namespaces and keeps them alive even when application containers restart. When <code>kubelet</code> creates a Pod, the first container to start is always <code>pause</code> — the others join its namespaces.</p>

          <pre><code># You can see it on any Kubernetes node:
crictl ps | grep pause

# Or with Docker in single-node mode:
docker ps | grep pause</code></pre>

          <p>If you understood this series, understanding Pods will feel natural — it is exactly the same mechanism, with namespaces selectively shared among processes.</p>
        `,
        },
      },
    ],
  },
];

export default tutorials;
