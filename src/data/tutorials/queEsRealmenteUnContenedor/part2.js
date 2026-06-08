export default {
  es: `
          <p>Un namespace es un envoltorio alrededor de un recurso global del kernel. Los procesos dentro del namespace ven su propia copia aislada de ese recurso — los cambios no son visibles fuera. El kernel de Linux tiene actualmente ocho tipos, cada uno con un propósito preciso.</p>

          <p>Antes de entrar a cada uno, establece la referencia: arranca un nginx y guarda su PID.</p>

          <pre><code>docker run --name demo --rm -d nginx:alpine
NGINX_PID=$(pgrep --oldest nginx)
sudo lsns -p \${NGINX_PID}</code></pre>

          <pre><code>        NS TYPE   NPROCS    PID USER COMMAND
4026531834 time      208      1 root /sbin/init
4026531837 user      206      1 root /sbin/init
4026532763 mnt         2 247519 root nginx: master process nginx -g daemon off;
4026532765 uts         2 247519 root nginx: master process nginx -g daemon off;
4026532766 ipc         2 247519 root nginx: master process nginx -g daemon off;
4026532767 pid         2 247519 root nginx: master process nginx -g daemon off;
4026532768 cgroup      2 247519 root nginx: master process nginx -g daemon off;
4026532769 net         2 247519 root nginx: master process nginx -g daemon off;</code></pre>

          <p><code>time</code> y <code>user</code> apuntan al PID 1 del host — son namespaces compartidos: Docker no crea estos dos por defecto, así que el contenedor los hereda del init del host (de ahí el <code>NPROCS</code> alto: cuenta todos los procesos del host que viven en esos namespaces). Los seis restantes (<code>mnt</code>, <code>uts</code>, <code>ipc</code>, <code>pid</code>, <code>cgroup</code>, <code>net</code>) son exclusivos del contenedor, con <code>NPROCS=2</code> (el <code>nginx</code> master y su worker). Vamos uno por uno.</p>

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

          <p>Para observar el aislamiento usamos dos utilidades de <code>util-linux</code>:</p>

          <ul>
            <li><code>ipcmk</code> (<em>IPC make</em>): crea un recurso IPC del kernel. Flags:
              <ul>
                <li><code>-M &lt;bytes&gt;</code> → crea un <strong>segmento de memoria compartida</strong> del tamaño indicado.</li>
                <li><code>-Q</code> → crea una <strong>cola de mensajes</strong> System V.</li>
                <li><code>-S &lt;n&gt;</code> → crea un <strong>set de semáforos</strong> con <code>n</code> semáforos.</li>
              </ul>
            </li>
            <li><code>ipcs</code> (<em>IPC status</em>): lista los recursos IPC visibles <em>desde el namespace actual</em>. Flags:
              <ul>
                <li><code>-m</code> → solo memoria compartida (<strong>sh</strong>ared <strong>m</strong>emory).</li>
                <li><code>-q</code> → solo colas de mensajes (<strong>q</strong>ueues).</li>
                <li><code>-s</code> → solo semáforos.</li>
                <li>sin flag → muestra las tres categorías.</li>
              </ul>
            </li>
          </ul>

          <p>La prueba: creamos un segmento en el host con <code>ipcmk -M</code> y verificamos que <code>ipcs -m</code> no lo ve desde dentro del contenedor — la tabla IPC del kernel es por namespace.</p>

          <pre><code># Crear un segmento de memoria compartida de 1024 bytes en el host
ipcmk -M 1024
# Shared memory id: 131072   ← shmid asignado por el kernel

# Listar memoria compartida desde el host
ipcs -m
# ------ Shared Memory Segments --------
# key        shmid  owner  perms  bytes  nattch
# 0x...     131072  user   644    1024   0     ← aquí está el segmento recién creado

# Desde dentro del contenedor: la tabla IPC está vacía
# (En Alpine 3.19+ el binario ipcs vive en util-linux-misc;
#  para versiones anteriores basta con util-linux.)
docker exec demo sh -c "apk add -q util-linux-misc 2>/dev/null || apk add -q util-linux; ipcs -m"
# ------ Shared Memory Segments --------
# (vacío)   ← el contenedor no ve el segmento del host</code></pre>

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

          <p>Estos tres flags forman una unidad — cada uno resuelve un problema distinto que los otros dejan abierto:</p>

          <p><strong><code>--pid</code></strong> — llama a <code>unshare(CLONE_NEWPID)</code> sobre el proceso actual. Crea el namespace, pero <code>unshare</code> mismo no entra en él como PID 1. El namespace existe vacío.</p>

          <p><strong><code>--fork</code></strong> — resuelve un detalle crítico: la syscall <code>unshare(CLONE_NEWPID)</code> <em>no mueve al proceso que la llama</em> al nuevo namespace (man <code>unshare(2)</code>: <em>"The calling process is not moved into the new namespace"</em>). Solo los hijos futuros nacen dentro — y el primero de esos hijos recibe PID 1. Sin <code>--fork</code>, <code>unshare</code> hace <code>execve(bash)</code> sin forkear primero, así que bash se queda en el namespace original. Cuando bash intenta lanzar cualquier comando externo, el primer hijo se convertiría en el "init" del namespace vacío y muere rápido; el siguiente fork falla porque ya no hay init:</p>

          <pre><code># Sin --fork: bash se queda en el namespace viejo; los forks al nuevo rompen
sudo unshare --pid bash
# bash: fork: Cannot allocate memory   ← setup interno de bash ya falla

# Los builtins siguen funcionando porque NO hacen fork:
echo $$        # 269188  ← PID del host, no es 1
pwd            # /root   ← builtin, OK
cd /etc        # builtin, OK
echo "howdy"   # builtin, OK

# Pero cualquier comando externo dispara un fork que el kernel rechaza:
ls             # bash: fork: Cannot allocate memory
ps             # bash: fork: Cannot allocate memory
which ls       # bash: fork: Cannot allocate memory

# ¿Por qué? El nuevo PID namespace quedó sin init vivo: el primer fork(),
# si prospera, se convierte en PID 1 y cuando ese proceso hijo termina
# (bash lo ejecuta y lo reapea) el namespace pierde su init. A partir
# de ahí todo fork() al namespace sin init es rechazado con ENOMEM.

# Verificación definitiva: comparar el inode del PID namespace.
# OJO: readlink es un binario externo, así que DENTRO del bash roto
# también fallará con "Cannot allocate memory". Hay que hacerlo DESDE FUERA.

# Paso 1 (dentro del bash unshared): obtener su PID con un builtin
echo $$                               # p. ej. 270772

# Paso 2 (desde otra terminal del host):
readlink /proc/270772/ns/pid          # ns del bash "unshared"
# pid:[4026531836]
readlink /proc/1/ns/pid               # ns del init del host
# pid:[4026531836]  ← mismo inode: bash NUNCA entró al nuevo namespace

# Con --fork: unshare hace fork() ANTES de execve, así el hijo bash nace
# como PID 1 dentro del nuevo namespace y queda vivo como init.
sudo unshare --pid --fork bash
echo $$                           # 1
ls /                              # funciona — hay init para reapear hijos
readlink /proc/self/ns/pid
# pid:[4026532767]  ← inode distinto: estás dentro</code></pre>

          <p><strong><code>--mount-proc</code></strong> — aunque ya tengas el PID namespace correcto, <code>/proc</code> sigue montado desde el namespace padre. Sin remontarlo, <code>ps aux</code> mostraría todos los procesos del host porque <code>/proc</code> apunta al árbol original. Este flag monta un <code>procfs</code> fresco que solo refleja el nuevo PID namespace.</p>

          <div class="callout callout-note">
            <span class="callout-label">Nota — <code>--mount-proc</code> implica <code>--mount</code></span>
            <p><code>--mount-proc</code> ya crea un mount namespace internamente: es equivalente a pasar <code>--mount</code> además. Si ves ambos flags juntos en algún script o tutorial, el <code>--mount</code> es redundante.</p>
          </div>

          <p>El PID namespace tiene dos consecuencias importantes adicionales:</p>

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

          <h3>Variante avanzada: <code>--mount-proc=&lt;ruta&gt;</code></h3>

          <p>Cuando a <code>--mount-proc</code> le pasas una ruta, <code>unshare</code> monta procfs <em>solo en esa ruta</em>, no en <code>/proc</code>. El <code>/proc</code> que ves desde el bash sigue siendo el del host, así que <code>ps aux</code> y <code>ls /proc</code> continuarán mostrando los procesos del host hasta que hagas <a href="/tutorial/que-es-realmente-un-contenedor/chroot-pivot-root"><code>pivot_root</code></a> al rootfs destino. Ese es exactamente el caso de uso: preparar <code>/tmp/rootfs/proc</code> para que, tras <a href="/tutorial/que-es-realmente-un-contenedor/chroot-pivot-root"><code>pivot_root</code></a>, el nuevo <code>/</code> ya tenga una procfs limpia apuntando al nuevo PID namespace.</p>

          <p>La diferencia se ve de inmediato:</p>

          <pre><code># Forma corta (sin ruta): monta procfs en /proc del namespace actual.
#   /proc y ps aux reflejan SOLO el nuevo PID namespace.
sudo unshare --pid --fork --mount-proc bash
echo $$
# 1
ps aux
# USER  PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
# root    1  0.0  0.2   9196  5396 pts/7    S    04:46   0:00 bash
# root   13  0.0  0.1  11320  4428 pts/7    R+   04:47   0:00 ps aux</code></pre>

          <pre><code># Forma con ruta: monta procfs en /tmp/rootfs/proc, NO en /proc.
#   /proc sigue siendo el del host: se ven cientos de PIDs ajenos.
mkdir -p /tmp/rootfs/proc
sudo unshare --pid --fork --mount-proc=/tmp/rootfs/proc bash

# Sorpresa aparente: SÍ estamos en un nuevo PID namespace...
echo $$
# 1                            ← bash es PID 1 en el namespace nuevo

# ...pero ps lee /proc, y /proc sigue siendo el del host:
ls /proc/
# 1     1232  14   164   18    219025 247519 253469 342  3732 44  57  654 895  cpuinfo kallsyms mtrr  tty
# 1003  1293  1450 166   1813  22     247563 253476 3429 3735 449 58  66  925  crypto  kcore    net   uptime
# ...  ← PIDs del host (247519 = nginx, 247563 = worker, etc.)

ps
#   PID TTY          TIME CMD
#     1 ?        00:00:04 systemd           ← NO es nuestro bash: es el init del host
#  1570 ?        00:06:52 kubelet
#  1785 ?        00:11:38 kube-apiserver
#  1886 ?        00:05:54 etcd
#  2293 ?        00:00:00 bash
#  ...                                      ← todos los procesos del host

# La nueva procfs sí está montada, pero escondida en la ruta que pediste:
ls /tmp/rootfs/proc/
# 1  cpuinfo  kcore  mounts  self  thread-self  ...   ← procfs del nuevo PID namespace</code></pre>

          <p>Lectura clave: el aislamiento del PID namespace <strong>sí está activo</strong> (<code>echo $$</code> devuelve <code>1</code>, y un <code>kill 1570</code> fallaría porque ese PID no existe en tu namespace). Lo que engaña es la <em>vista</em>: herramientas como <code>ps</code>, <code>top</code> o <code>pgrep</code> leen <code>/proc</code>, y ese <code>/proc</code> sigue siendo la procfs del host. Sin remontarlo — o sin hacer <a href="/tutorial/que-es-realmente-un-contenedor/chroot-pivot-root"><code>pivot_root</code></a> — el namespace parece "roto" aunque esté funcionando bien.</p>

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
# 9: vetha6b7066@if2: &lt;BROADCAST,MULTICAST,UP,LOWER_UP&gt; mtu 1500 ...
#     link/ether 2e:73:a5:d0:40:a6 brd ff:ff:ff:ff:ff:ff
#     master docker0

# Dentro del contenedor: su extremo del par
docker exec demo ip addr show eth0
# 2: eth0@if9: &lt;BROADCAST,MULTICAST,UP,LOWER_UP&gt; mtu 1500
#     inet 172.17.0.2/16 brd 172.17.255.255 scope global eth0

# @if2 en el host apunta al índice 2 del contenedor (eth0)
# @if9 en el contenedor apunta al índice 9 del host (vetha6b7066)</code></pre>

          <div class="callout callout-note">
            <span class="callout-label">Nota</span>
            <p>Si corres Kubernetes en el mismo host, verás <strong>más</strong> interfaces veth además de las de Docker: los CNIs como Calico (<code>cali*</code>), Flannel (<code>flannel.1</code>, <code>cni0</code>) o Cilium (<code>lxc*</code>) crean sus propios pares veth hacia los Pods. El mecanismo es el mismo; lo que cambia es quién las orquesta. También es común ver MTUs menores a 1500 (p. ej. 1450 o 1454) porque los CNIs reservan bytes para encapsulación VXLAN/IPIP.</p>
          </div>

          <p>Cada contenedor tiene su propia tabla de rutas, reglas de iptables y conexiones activas. Docker gestiona las reglas de NAT en el host (<code>iptables -t nat -L DOCKER</code>) para que el tráfico entre <code>docker0</code> y el exterior funcione.</p>

          <pre><code># Ver las conexiones TCP activas del contenedor (solo las suyas)
sudo nsenter -t \${NGINX_PID} --net ss -tlnp
# State  Recv-Q  Send-Q  Local Address:Port
# LISTEN 0       511           0.0.0.0:80</code></pre>

          <h2>6. user — User namespace</h2>

          <p><strong>Flag:</strong> <code>CLONE_NEWUSER</code> — el más poderoso y el más complejo. Aisla UIDs y GIDs, permitiendo mapear identidades entre el namespace y el host.</p>

          <p>La capacidad crítica: un proceso puede ser UID 0 (root) <em>dentro</em> del namespace pero mapearse a un UID no privilegiado en el host. Esto es la base de los contenedores <strong>rootless</strong>.</p>

          <pre><code># Crear un user namespace sin necesitar sudo (ejecutar como usuario normal)
unshare --user --map-root-user bash

# Dentro: somos root
id
# uid=0(root) gid=0(root) groups=0(root),...

# El kernel mapea ese UID 0 interno al UID real del host que invocó unshare
cat /proc/self/uid_map
# 0  1000  1   ← si invocaste como UID 1000, verás 1000 en la columna del medio
# 0  0     1   ← si ya eras root (UID 0), verás 0 — no hay "rebaja" real</code></pre>

          <p>El archivo <code>/proc/self/uid_map</code> tiene el formato: <code>&lt;uid-inicio-namespace&gt; &lt;uid-inicio-host&gt; &lt;cantidad&gt;</code>. Para que el user namespace sirva de <em>barrera de privilegio</em>, el UID del host al que se mapea el 0 interno debe ser un UID <strong>no privilegiado</strong>. Llamar a <code>unshare --user --map-root-user</code> como root (con <code>sudo</code> o en una sesión root) produce <code>0 0 1</code> — técnicamente estás en un user namespace nuevo, pero sin aislamiento de privilegio.</p>

          <p>Docker <strong>no activa</strong> el user namespace por defecto porque históricamente tuvo problemas de compatibilidad con algunas imágenes. Cuando UID 0 del contenedor = UID 0 del host, una fuga del contenedor te aterriza como root real en el host. Para eliminar ese riesgo necesitas <em>explícitamente</em>:</p>

          <ul>
            <li><code>dockerd --userns-remap=default</code> en el daemon de Docker, o</li>
            <li>Docker rootless (instalado con <a href="https://docs.docker.com/engine/security/rootless/" target="_blank" rel="noopener">dockerd-rootless-setuptool.sh</a>), o</li>
            <li>Podman <strong>ejecutado como usuario normal</strong> (no con sudo).</li>
          </ul>

          <pre><code># Verificar si Docker usa user namespace
docker info | grep "Security Options" -A5
# Security Options:
#  apparmor
#  seccomp
#   Profile: builtin
#  cgroupns           ← no aparece "userns"

# Podman como ROOT: NO es rootless, es equivalente a Docker
sudo podman run --rm alpine cat /proc/self/uid_map
# 0  0  4294967295   ← identity mapping, igual que Docker como root

# Podman como USUARIO NORMAL: rootless real!!!
# (como usuario "testuser" con UID 1001, sin sudo)
podman run --rm alpine id
# uid=0(root) gid=0(root)  ← root dentro del contenedor

podman run --rm alpine cat /proc/self/uid_map
# 0     1001     1       ← UID 0 del contenedor = UID 1001 del host
# 1   231072 65536       ← UIDs 1..65535 mapeados al subrango de /etc/subuid
#
# Los números de la segunda fila vienen de /etc/subuid:
#   $ grep testuser /etc/subuid
#   testuser:231072:65536
# useradd asigna un bloque alineado de 65536 UIDs por usuario nuevo.</code></pre>

          <div class="callout callout-note">
            <span class="callout-label">Verificación empírica</span>
            <p>Puedes reproducir los tres casos (root directo, usuario normal, sudoer con sudo) con el script <a href="/test-podman-userns.sh" download><code>test-podman-userns.sh</code></a>. El caso "sudoer con sudo" produce exactamente el mismo <code>uid_map</code> que "root directo" — ser sudoer no aporta aislamiento; lo único que cuenta es el UID efectivo que ejecuta <code>podman</code>.</p>
          </div>

          <h2>7. cgroup — Cgroup namespace</h2>

          <div class="callout callout-warning">
            <span class="callout-label">Importante: cgroup namespace ≠ cgroups</span>
            <p>Este namespace <strong>no controla recursos</strong>. Solo virtualiza <em>la vista</em> que el proceso tiene del filesystem <code>/sys/fs/cgroup</code> — es decir, qué parte de la jerarquía de cgroups puede ver. El mecanismo de <em>control real</em> de CPU, memoria e I/O son los <strong>cgroups propiamente dichos</strong>, que se cubren a fondo en <a href="/tutorial/que-es-realmente-un-contenedor/cgroups">cgroups: control real de recursos (v1 vs v2)</a>.</p>
            <p>Regla mental: <em>cgroups</em> imponen límites; el <em>cgroup namespace</em> decide cuánto de la jerarquía puedes observar desde dentro del contenedor.</p>
          </div>

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

          <pre><code># Crear un time namespace con CLOCK_MONOTONIC adelantado 1 hora
# (requiere kernel >= 5.6)
sudo unshare --time --monotonic 3600 --boottime 3600 bash

# Verificar el offset registrado
cat /proc/self/timens_offsets
# monotonic   3600   0
# boottime    3600   0

# Prueba real: /proc/uptime usa CLOCK_BOOTTIME — dentro está 1h adelantado
cat /proc/uptime
# 33986.22 27212.64    ← dentro del namespace

# Salir y leer la misma métrica en el host
exit
cat /proc/uptime
# 30415.07 27238.65    ← host: ~3570s menos (la diferencia ≈ 3600s del offset)

# date NO cambia — usa CLOCK_REALTIME, que NO se aisla por diseño
sudo unshare --time --monotonic 3600 --boottime 3600 bash
date
# Tue Apr 21 07:26:31 UTC 2026   ← dentro
exit
date
# Tue Apr 21 07:26:35 UTC 2026   ← host (solo los segundos que tardaste en salir)</code></pre>

          <div class="callout callout-note">
            <span class="callout-label">Nota — offsets negativos</span>
            <p>Solo offsets <strong>positivos</strong> funcionan en la práctica. util-linux rechaza valores negativos con <code>Numerical result out of range</code> porque el kernel impide poner los relojes del namespace antes del boot del host (esto prevendría que los TTLs y timeouts activos salten al pasado).</p>
          </div>

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

          <pre><code># nsenter hace lo mismo que docker exec, manualmente.
# Usa sh (no bash): al entrar al mount namespace, el rootfs pasa a ser
# el del contenedor. Si la imagen es Alpine, no existe /bin/bash.
sudo nsenter -t \${NGINX_PID} --pid --net --mount --uts --ipc sh

# Ahora estás dentro de todos los namespaces del contenedor
hostname    # el hostname del contenedor (p. ej. 0c04908ce4f7)
ip addr     # la red del contenedor (172.17.0.2/16)
ps aux      # los procesos del contenedor
# PID   USER     TIME  COMMAND
#     1 root      0:00 nginx: master process nginx -g daemon off;
#    30 nginx     0:00 nginx: worker process
#    39 root      0:00 sh
#    42 root      0:00 ps aux</code></pre>

          <p>Como esta imagen es <code>nginx:alpine</code>, también puedes usar <code>ash</code> en vez de <code>sh</code>. <code>sh</code> es preferible ya que garantiza correr en cualquier imagen no-Alpine (Debian, Ubuntu, RHEL) donde <code>ash</code> no está disponible.</p>

          <p>El par <code>pid_for_children</code> / <code>time_for_children</code> indica el namespace que <em>heredarán</em> los próximos procesos hijos. El truco es que <code>setns()</code> a un PID namespace o a un time namespace <strong>no mueve al proceso actual</strong> — esas identidades son inmutables tras el nacimiento —, pero sí cambia el namespace al que se unirán los hijos <code>fork()</code>eados después. Por eso estos dos enlaces son distintos de <code>pid</code> y <code>time</code>: el proceso actual sigue en el viejo namespace, pero sus hijos ya nacen en el nuevo.</p>
        `,
  en: `
          <p>A namespace is a wrapper around a global kernel resource. Processes inside the namespace see their own isolated copy of that resource — changes are not visible outside. The Linux kernel currently has eight types, each with a specific purpose.</p>

          <p>Before diving into each one, establish a reference point: start an nginx container and save its PID.</p>

          <pre><code>docker run --name demo --rm -d nginx:alpine
NGINX_PID=$(pgrep --oldest nginx)
sudo lsns -p \${NGINX_PID}</code></pre>

          <pre><code>        NS TYPE   NPROCS    PID USER COMMAND
4026531834 time      208      1 root /sbin/init
4026531837 user      206      1 root /sbin/init
4026532763 mnt         2 247519 root nginx: master process nginx -g daemon off;
4026532765 uts         2 247519 root nginx: master process nginx -g daemon off;
4026532766 ipc         2 247519 root nginx: master process nginx -g daemon off;
4026532767 pid         2 247519 root nginx: master process nginx -g daemon off;
4026532768 cgroup      2 247519 root nginx: master process nginx -g daemon off;
4026532769 net         2 247519 root nginx: master process nginx -g daemon off;</code></pre>

          <p><code>time</code> and <code>user</code> point to PID 1 on the host — these are shared namespaces: Docker does not create them by default, so the container inherits them from the host init (that is why <code>NPROCS</code> is so high — it counts every host process living in those namespaces). The remaining six (<code>mnt</code>, <code>uts</code>, <code>ipc</code>, <code>pid</code>, <code>cgroup</code>, <code>net</code>) are exclusive to the container, with <code>NPROCS=2</code> (the nginx master and its worker). Let's go through them one by one.</p>

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

          <p>We use two <code>util-linux</code> utilities to observe the isolation:</p>

          <ul>
            <li><code>ipcmk</code> (<em>IPC make</em>): creates a kernel IPC resource. Flags:
              <ul>
                <li><code>-M &lt;bytes&gt;</code> → creates a <strong>shared memory segment</strong> of the given size.</li>
                <li><code>-Q</code> → creates a System V <strong>message queue</strong>.</li>
                <li><code>-S &lt;n&gt;</code> → creates a <strong>semaphore set</strong> with <code>n</code> semaphores.</li>
              </ul>
            </li>
            <li><code>ipcs</code> (<em>IPC status</em>): lists the IPC resources visible <em>from the current namespace</em>. Flags:
              <ul>
                <li><code>-m</code> → <strong>sh</strong>ared <strong>m</strong>emory only.</li>
                <li><code>-q</code> → message <strong>q</strong>ueues only.</li>
                <li><code>-s</code> → <strong>s</strong>emaphores only.</li>
                <li>no flag → shows all three categories.</li>
              </ul>
            </li>
          </ul>

          <p>The test: we create a segment on the host with <code>ipcmk -M</code> and confirm that <code>ipcs -m</code> cannot see it from inside the container — the kernel's IPC table is per-namespace.</p>

          <pre><code># Create a 1024-byte shared memory segment on the host
ipcmk -M 1024
# Shared memory id: 131072   ← shmid assigned by the kernel

# List shared memory from the host
ipcs -m
# ------ Shared Memory Segments --------
# key        shmid  owner  perms  bytes  nattch
# 0x...     131072  user   644    1024   0     ← the segment we just created

# From inside the container: the IPC table is empty
# (On Alpine 3.19+ the ipcs binary ships in util-linux-misc;
#  older Alpine versions keep it in util-linux.)
docker exec demo sh -c "apk add -q util-linux-misc 2>/dev/null || apk add -q util-linux; ipcs -m"
# ------ Shared Memory Segments --------
# (empty)   ← the container does not see the host's segment</code></pre>

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

          <p>These three flags form a unit — each one solves a distinct problem the others leave open:</p>

          <p><strong><code>--pid</code></strong> — calls <code>unshare(CLONE_NEWPID)</code> on the current process. It creates the namespace, but <code>unshare</code> itself does not enter it as PID 1. The namespace exists empty.</p>

          <p><strong><code>--fork</code></strong> — fixes a critical detail: the <code>unshare(CLONE_NEWPID)</code> syscall <em>does not move the calling process</em> into the new namespace (man <code>unshare(2)</code>: <em>"The calling process is not moved into the new namespace"</em>). Only future children are born inside — and the first of those becomes PID 1. Without <code>--fork</code>, <code>unshare</code> does <code>execve(bash)</code> without forking first, so bash stays in the original namespace. When bash then tries to run any external command, the first child would be the "init" of an empty namespace, dies quickly, and subsequent forks fail because the namespace now has no init:</p>

          <pre><code># Without --fork: bash stays in the old namespace; forks into the new one break
sudo unshare --pid bash
# bash: fork: Cannot allocate memory   ← even bash's own setup fork fails

# Shell builtins keep working because they do NOT fork:
echo $$        # 269188  ← host PID, not 1
pwd            # /root   ← builtin, OK
cd /etc        # builtin, OK
echo "howdy"   # builtin, OK

# But any external command triggers a fork the kernel rejects:
ls             # bash: fork: Cannot allocate memory
ps             # bash: fork: Cannot allocate memory
which ls       # bash: fork: Cannot allocate memory

# Why? The new PID namespace has no live init: the first successful fork
# becomes PID 1 and when that child exits (bash executes and reaps it)
# the namespace loses its init. From then on any fork into an init-less
# namespace is rejected with ENOMEM.

# Definitive check: compare the PID namespace inode.
# NOTE: readlink is an external binary, so INSIDE the broken bash it will
# also fail with "Cannot allocate memory". Do it FROM OUTSIDE.

# Step 1 (inside the unshared bash): get its PID with a builtin
echo $$                               # e.g. 270772

# Step 2 (from another terminal on the host):
readlink /proc/270772/ns/pid          # ns of the unshared bash
# pid:[4026531836]
readlink /proc/1/ns/pid               # ns of the host init
# pid:[4026531836]  ← same inode: bash NEVER entered the new namespace

# With --fork: unshare calls fork() BEFORE execve, so the child bash
# is born as PID 1 inside the new namespace and stays alive as init.
sudo unshare --pid --fork bash
echo $$                               # 1
ls /                                  # works — there is an init to reap children
readlink /proc/self/ns/pid
# pid:[4026532767]  ← different inode: you are inside</code></pre>

          <p><strong><code>--mount-proc</code></strong> — even with the right PID namespace, <code>/proc</code> is still mounted from the parent namespace. Without remounting it, <code>ps aux</code> would show every host process because <code>/proc</code> still points to the original tree. This flag mounts a fresh <code>procfs</code> that only reflects the new PID namespace.</p>

          <div class="callout callout-note">
            <span class="callout-label">Note — <code>--mount-proc</code> implies <code>--mount</code></span>
            <p><code>--mount-proc</code> implicitly creates a mount namespace: it is equivalent to also passing <code>--mount</code>. If you see both flags together in some script or tutorial, the <code>--mount</code> is redundant.</p>
          </div>

          <p>The PID namespace has two additional important consequences:</p>

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

          <h3>Advanced variant: <code>--mount-proc=&lt;path&gt;</code></h3>

          <p>When you pass a path to <code>--mount-proc</code>, <code>unshare</code> mounts procfs <em>only at that path</em>, not at <code>/proc</code>. The <code>/proc</code> visible from the bash is still the host's, so <code>ps aux</code> and <code>ls /proc</code> will keep showing the host's processes until you <a href="/tutorial/que-es-realmente-un-contenedor/chroot-pivot-root"><code>pivot_root</code></a> into the target rootfs. That is precisely the use case: prepare <code>/tmp/rootfs/proc</code> so that, after <a href="/tutorial/que-es-realmente-un-contenedor/chroot-pivot-root"><code>pivot_root</code></a>, the new <code>/</code> already has a clean procfs pointing at the new PID namespace.</p>

          <p>The difference is visible immediately:</p>

          <pre><code># Short form (no path): mounts procfs at /proc of the current namespace.
#   /proc and ps aux reflect ONLY the new PID namespace.
sudo unshare --pid --fork --mount-proc bash
echo $$
# 1
ps aux
# USER  PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
# root    1  0.0  0.2   9196  5396 pts/7    S    04:46   0:00 bash
# root   13  0.0  0.1  11320  4428 pts/7    R+   04:47   0:00 ps aux</code></pre>

          <pre><code># Path form: mounts procfs at /tmp/rootfs/proc, NOT at /proc.
#   /proc still belongs to the host: hundreds of foreign PIDs are visible.
mkdir -p /tmp/rootfs/proc
sudo unshare --pid --fork --mount-proc=/tmp/rootfs/proc bash

# Apparent surprise: we ARE in a new PID namespace...
echo $$
# 1                            ← bash is PID 1 in the new namespace

# ...but ps reads /proc, and /proc is still the host's:
ls /proc/
# 1     1232  14   164   18    219025 247519 253469 342  3732 44  57  654 895  cpuinfo kallsyms mtrr  tty
# 1003  1293  1450 166   1813  22     247563 253476 3429 3735 449 58  66  925  crypto  kcore    net   uptime
# ...  ← host PIDs (247519 = nginx, 247563 = worker, etc.)

ps
#   PID TTY          TIME CMD
#     1 ?        00:00:04 systemd           ← NOT our bash: it is the host's init
#  1570 ?        00:06:52 kubelet
#  1785 ?        00:11:38 kube-apiserver
#  1886 ?        00:05:54 etcd
#  2293 ?        00:00:00 bash
#  ...                                      ← every host process

# The new procfs IS mounted, but hidden at the path you asked for:
ls /tmp/rootfs/proc/
# 1  cpuinfo  kcore  mounts  self  thread-self  ...   ← procfs of the new PID namespace</code></pre>

          <p>Key takeaway: the PID namespace isolation <strong>is active</strong> (<code>echo $$</code> returns <code>1</code>, and <code>kill 1570</code> would fail because that PID does not exist in your namespace). What misleads you is the <em>view</em>: tools like <code>ps</code>, <code>top</code> or <code>pgrep</code> read <code>/proc</code>, and that <code>/proc</code> is still the host's procfs. Without remounting it — or without doing a <a href="/tutorial/que-es-realmente-un-contenedor/chroot-pivot-root"><code>pivot_root</code></a> — the namespace looks "broken" even though it is working correctly.</p>

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
# 9: vetha6b7066@if2: &lt;BROADCAST,MULTICAST,UP,LOWER_UP&gt; mtu 1500 ...
#     link/ether 2e:73:a5:d0:40:a6 brd ff:ff:ff:ff:ff:ff
#     master docker0

# Inside the container: its end of the pair
docker exec demo ip addr show eth0
# 2: eth0@if9: &lt;BROADCAST,MULTICAST,UP,LOWER_UP&gt; mtu 1500
#     inet 172.17.0.2/16 brd 172.17.255.255 scope global eth0

# @if2 on the host points to container interface index 2 (eth0)
# @if9 on the container points to host interface index 9 (vetha6b7066)</code></pre>

          <div class="callout callout-note">
            <span class="callout-label">Note</span>
            <p>If Kubernetes is running on the same host, you will see <strong>more</strong> veth interfaces in addition to Docker's: CNIs like Calico (<code>cali*</code>), Flannel (<code>flannel.1</code>, <code>cni0</code>) and Cilium (<code>lxc*</code>) create their own veth pairs into the Pods. The mechanism is the same; what differs is who orchestrates them. It is also common to see MTUs below 1500 (e.g. 1450 or 1454) because those CNIs reserve bytes for VXLAN/IPIP encapsulation.</p>
          </div>

          <p>Each container has its own routing table, iptables rules, and active connections. Docker manages the NAT rules on the host (<code>iptables -t nat -L DOCKER</code>) so that traffic between <code>docker0</code> and the outside world works.</p>

          <pre><code># View the container's active TCP connections (only its own)
sudo nsenter -t \${NGINX_PID} --net ss -tlnp
# State  Recv-Q  Send-Q  Local Address:Port
# LISTEN 0       511           0.0.0.0:80</code></pre>

          <h2>6. user — User namespace</h2>

          <p><strong>Flag:</strong> <code>CLONE_NEWUSER</code> — the most powerful and most complex. Isolates UIDs and GIDs, allowing identities to be mapped between the namespace and the host.</p>

          <p>The critical capability: a process can be UID 0 (root) <em>inside</em> the namespace but map to an unprivileged UID on the host. This is the foundation of <strong>rootless</strong> containers.</p>

          <pre><code># Create a user namespace without needing sudo (run as a regular user)
unshare --user --map-root-user bash

# Inside: we are root
id
# uid=0(root) gid=0(root) groups=0(root),...

# The kernel maps that internal UID 0 to the real host UID that called unshare
cat /proc/self/uid_map
# 0  1000  1   ← if you invoked as UID 1000, you'll see 1000 in the middle column
# 0  0     1   ← if you were already root (UID 0), you see 0 — no real drop</code></pre>

          <p>The <code>/proc/self/uid_map</code> file has the format: <code>&lt;namespace-start-uid&gt; &lt;host-start-uid&gt; &lt;count&gt;</code>. For the user namespace to act as a <em>privilege barrier</em>, the host UID that the internal 0 maps to must be an <strong>unprivileged</strong> UID. Calling <code>unshare --user --map-root-user</code> as root (via <code>sudo</code> or in a root session) yields <code>0 0 1</code> — you are technically in a new user namespace, but with no privilege isolation.</p>

          <p>Docker <strong>does not enable</strong> the user namespace by default because it historically had compatibility issues with some images. When the container's UID 0 equals the host's UID 0, a container escape lands you as real root. To eliminate that risk you need <em>explicitly</em>:</p>

          <ul>
            <li><code>dockerd --userns-remap=default</code> on the Docker daemon, or</li>
            <li>Docker rootless (installed via <a href="https://docs.docker.com/engine/security/rootless/" target="_blank" rel="noopener">dockerd-rootless-setuptool.sh</a>), or</li>
            <li>Podman <strong>run as a regular user</strong> (not via sudo).</li>
          </ul>

          <pre><code># Check whether Docker uses user namespaces
docker info | grep "Security Options" -A5
# Security Options:
#  apparmor
#  seccomp
#   Profile: builtin
#  cgroupns           ← "userns" does not appear

# Podman as ROOT: NOT rootless, equivalent to Docker
sudo podman run --rm alpine cat /proc/self/uid_map
# 0  0  4294967295   ← identity mapping, same as Docker when run as root

# Podman as a REGULAR USER: real rootless!!!
# (as user "testuser" with UID 1001, no sudo)
podman run --rm alpine id
# uid=0(root) gid=0(root)  ← root inside the container

podman run --rm alpine cat /proc/self/uid_map
# 0     1001     1       ← container UID 0 = host UID 1001
# 1   231072 65536       ← UIDs 1..65535 mapped to the /etc/subuid subrange
#
# The second-row numbers come from /etc/subuid:
#   $ grep testuser /etc/subuid
#   testuser:231072:65536
# useradd assigns a 65536-aligned block of UIDs for each new user.</code></pre>

          <div class="callout callout-note">
            <span class="callout-label">Empirical verification</span>
            <p>You can reproduce the three cases (direct root, regular user, sudoer with sudo) with the <a href="/test-podman-userns.sh" download><code>test-podman-userns.sh</code></a> script. The "sudoer with sudo" case produces the exact same <code>uid_map</code> as "direct root" — being a sudoer does not add isolation; only the effective UID that executes <code>podman</code> matters.</p>
          </div>

          <h2>7. cgroup — Cgroup namespace</h2>

          <div class="callout callout-warning">
            <span class="callout-label">Important: cgroup namespace ≠ cgroups</span>
            <p>This namespace <strong>does not control resources</strong>. It only virtualizes <em>the view</em> that the process has of the <code>/sys/fs/cgroup</code> filesystem — i.e., how much of the cgroup hierarchy it can see. The <em>actual control</em> of CPU, memory and I/O is done by <strong>cgroups themselves</strong>, which are covered in depth in <a href="/tutorial/que-es-realmente-un-contenedor/cgroups">cgroups: real resource control (v1 vs v2)</a>.</p>
            <p>Rule of thumb: <em>cgroups</em> enforce limits; the <em>cgroup namespace</em> decides how much of the hierarchy you can observe from inside the container.</p>
          </div>

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

          <pre><code># Create a time namespace with CLOCK_MONOTONIC shifted 1 hour forward
# (requires kernel >= 5.6)
sudo unshare --time --monotonic 3600 --boottime 3600 bash

# Verify the registered offset
cat /proc/self/timens_offsets
# monotonic   3600   0
# boottime    3600   0

# Real check: /proc/uptime uses CLOCK_BOOTTIME — inside it is 1h ahead
cat /proc/uptime
# 33986.22 27212.64    ← inside the namespace

# Exit and read the same metric on the host
exit
cat /proc/uptime
# 30415.07 27238.65    ← host: ~3570s less (difference ≈ the 3600s offset)

# date does NOT change — it uses CLOCK_REALTIME, which is NOT isolated
sudo unshare --time --monotonic 3600 --boottime 3600 bash
date
# Tue Apr 21 07:26:31 UTC 2026   ← inside
exit
date
# Tue Apr 21 07:26:35 UTC 2026   ← host (only the seconds you spent exiting)</code></pre>

          <div class="callout callout-note">
            <span class="callout-label">Note — negative offsets</span>
            <p>Only <strong>positive</strong> offsets actually work. util-linux rejects negative values with <code>Numerical result out of range</code> because the kernel refuses to set the namespace clocks earlier than the host's boot (that would make live TTLs and timeouts jump into the past).</p>
          </div>

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

          <pre><code># nsenter does the same thing as docker exec, manually.
# Use sh (not bash): entering the mount namespace switches the rootfs
# to the container's. If the image is Alpine, /bin/bash does not exist.
sudo nsenter -t \${NGINX_PID} --pid --net --mount --uts --ipc sh

# You are now inside all of the container's namespaces
hostname    # the container's hostname (e.g. 0c04908ce4f7)
ip addr     # the container's network (172.17.0.2/16)
ps aux      # the container's processes
# PID   USER     TIME  COMMAND
#     1 root      0:00 nginx: master process nginx -g daemon off;
#    30 nginx     0:00 nginx: worker process
#    39 root      0:00 sh
#    42 root      0:00 ps aux</code></pre>

          <p>Since this image is <code>nginx:alpine</code>, you can also use <code>ash</code> instead of <code>sh</code>. <code>sh</code> is preferable because it is guaranteed to run on any non-Alpine image (Debian, Ubuntu, RHEL) where <code>ash</code> is not available.</p>

          <p>The <code>pid_for_children</code> / <code>time_for_children</code> pair indicates the namespace that the next child processes will <em>inherit</em>. The subtlety is that calling <code>setns()</code> on a PID or time namespace <strong>does not move the current process</strong> — those identities are immutable after birth — but it does change the namespace that subsequently <code>fork()</code>ed children will join. That is why these two links can diverge from <code>pid</code> and <code>time</code>: the current process stays in the old namespace while its children are born in the new one.</p>
        `,
}
