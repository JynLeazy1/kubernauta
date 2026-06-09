export default {
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

          <pre><code>Current: cap_chown,cap_dac_override,cap_fowner,cap_fsetid,cap_kill,
         cap_setgid,cap_setuid,cap_setpcap,cap_net_bind_service,
         cap_net_raw,cap_sys_chroot,cap_mknod,cap_audit_write,
         cap_setfcap=ep
Bounding set =cap_chown,cap_dac_override,cap_fowner,cap_fsetid,cap_kill,
              cap_setgid,cap_setuid,cap_setpcap,cap_net_bind_service,
              cap_net_raw,cap_sys_chroot,cap_mknod,cap_audit_write,cap_setfcap
Ambient set =
Current IAB: !cap_dac_read_search,!cap_linux_immutable,!cap_net_broadcast,
             !cap_net_admin,!cap_ipc_lock,!cap_ipc_owner,!cap_sys_module,
             !cap_sys_rawio,!cap_sys_ptrace,!cap_sys_pacct,!cap_sys_admin,
             !cap_sys_boot,!cap_sys_nice,!cap_sys_resource,!cap_sys_time,
             !cap_sys_tty_config,!cap_lease,!cap_audit_control,
             !cap_mac_override,!cap_mac_admin,!cap_syslog,!cap_wake_alarm,
             !cap_block_suspend,!cap_audit_read,!cap_perfmon,!cap_bpf,
             !cap_checkpoint_restore
Securebits: 00/0x0/1'b0 (no-new-privs=0)
 secure-noroot: no (unlocked)
 secure-no-suid-fixup: no (unlocked)
 secure-keep-caps: no (unlocked)
 secure-no-ambient-raise: no (unlocked)
uid=0(root) euid=0(root)
gid=0(root)
Guessed mode: HYBRID (4)</code></pre>

          <p>Dos campos que vale la pena mirar:</p>

          <ul>
            <li><strong><code>Bounding set</code></strong> — el techo duro. Ninguna capability fuera de este conjunto puede reaparecer, aunque un binario setuid las intente activar. Docker lo iguala a <code>Current</code>, así que "ganar" capabilities nuevas desde dentro del contenedor es imposible.</li>
            <li><strong><code>Current IAB</code></strong> — las capabilities con prefijo <code>!</code> son las que están <em>explícitamente negadas</em> en Inheritable/Ambient/Bounding. Ahí ves todo lo que Docker dropea por defecto: <code>cap_sys_admin</code>, <code>cap_sys_ptrace</code>, <code>cap_net_admin</code>, <code>cap_sys_module</code>, <code>cap_bpf</code>, <code>cap_checkpoint_restore</code>, etc.</li>
          </ul>

          <p>Las peligrosas están fuera: <code>CAP_SYS_ADMIN</code>, <code>CAP_SYS_PTRACE</code>, <code>CAP_NET_ADMIN</code>, <code>CAP_SYS_MODULE</code>. Esto significa que incluso siendo UID 0 dentro del contenedor, no puedes montar filesystems arbitrarios, cargar módulos del kernel ni depurar procesos de otros namespaces.</p>

          <h2>Agregar y quitar capabilities</h2>

          <pre><code># Agregar: permite hacer ping sin ser root
docker run --rm --cap-add NET_RAW alpine ping -c1 8.8.8.8
# PING 8.8.8.8 (8.8.8.8): 56 data bytes
# 64 bytes from 8.8.8.8: seq=0 ttl=115 time=12.470 ms

# Quitar CAP_CHOWN a nginx: el contenedor NO arranca.
# nginx necesita chown() al inicio para preparar sus directorios de caché.
docker run --rm --cap-drop CHOWN nginx:alpine
# 2026/04/21 07:43:35 [emerg] 1#1: chown("/var/cache/nginx/client_temp", 101)
# failed (1: Operation not permitted)
# nginx: [emerg] chown("/var/cache/nginx/client_temp", 101) failed (1: ...)
#
# Moraleja: "bajar capabilities" no es gratis. Hay que conocer qué
# syscalls privilegiadas usa el binario antes de recortarle privilegios.

# Ejemplo que SÍ funciona: demostrar el bloqueo sin matar el contenedor.
# Creamos un archivo y verificamos que chown falla con y sin CAP_CHOWN.
docker run --rm alpine sh -c "touch /tmp/f && chown 1000 /tmp/f && echo OK"
# OK                                    ← con CHOWN por defecto, pasa

docker run --rm --cap-drop CHOWN alpine sh -c "touch /tmp/f && chown 1000 /tmp/f"
# chown: /tmp/f: Operation not permitted  ← sin CHOWN, el kernel bloquea

# Modo mínimo: sin ninguna capability — útil como baseline de seguridad.
# sh arranca porque no necesita privilegios.
docker run --rm --cap-drop ALL alpine sh
# /             (la shell arranca normal)</code></pre>

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

          <h2>Cómo listar capabilities en Linux</h2>

          <p>Hay cuatro herramientas habituales según qué quieras inspeccionar — todas vienen del paquete <code>libcap2-bin</code> (Ubuntu/Debian) o <code>libcap</code> (Alpine):</p>

          <p><strong>1. Las capabilities del proceso actual</strong> (lectura directa del kernel):</p>

          <pre><code>capsh --print
# Current: =ep                     ← root sin restringir; "=ep" significa
#                                    "todas las soportadas, en e+p"
# Bounding set =cap_chown,cap_dac_override,...,cap_checkpoint_restore
# Ambient set =
# Current IAB:                     ← vacío en root sin restringir
# Securebits: 00/0x0/1'b0 (no-new-privs=0)
#  secure-noroot: no (unlocked)
#  secure-no-suid-fixup: no (unlocked)
#  secure-keep-caps: no (unlocked)
#  secure-no-ambient-raise: no (unlocked)
# uid=0(root) euid=0(root)
# gid=0(root)
# Guessed mode: HYBRID (4)</code></pre>

          <p>La notación <code>=ep</code> en <code>Current</code> es una forma compacta de "todas las capabilities soportadas, marcadas como Effective y Permitted". Cuando el proceso tiene un subconjunto explícito (como un container Docker), <code>Current</code> se imprime como una lista <code>cap_chown,cap_kill,...=ep</code>.</p>

          <p><strong>2. Las capabilities de un proceso por PID</strong> (forma humana de leer <code>/proc/&lt;pid&gt;/status</code>):</p>

          <pre><code>getpcaps 1
# 1: =ep    ← PID 1 (init) tiene todas activas (en hosts no-systemd hardened)

getpcaps $(pgrep nginx)
# 75563: cap_chown,cap_dac_override,cap_fowner,...,cap_setfcap=ep
# 75597: =                        ← ¡cero capabilities!</code></pre>

          <p>El segundo PID con <code>=</code> vacío revela el patrón clásico de privilege separation de nginx: el <strong>master</strong> arranca con las caps que necesita (<code>cap_net_bind_service</code> para abrir el puerto 80), forkea los <strong>workers</strong>, y los workers dropean todas las caps antes de empezar a servir tráfico. Si un atacante compromete un worker, no tiene capabilities que escalar — y el worker no puede abrir nuevos sockets privilegiados.</p>

          <p><strong>3. Las capabilities de un binario en disco</strong> (file capabilities — atributos extendidos del filesystem):</p>

          <pre><code>getcap -r /usr/bin 2>/dev/null
# /usr/bin/mtr-packet  cap_net_raw=ep
# /usr/bin/ping        cap_net_raw=ep
#
# Por eso ping funciona sin sudo: no es setuid root, tiene cap_net_raw
# pegada al ejecutable. setcap/getcap manejan esos atributos.</code></pre>

          <p>En sistemas con rootless containers configurado, vas a ver además <code>newuidmap</code> y <code>newgidmap</code> con <code>cap_setuid</code>/<code>cap_setgid</code>. La lista exacta depende de qué tools instaló tu distro.</p>

          <p><strong>4. La lista completa de capabilities que el kernel soporta</strong>:</p>

          <pre><code># --supports verifica si una cap específica está implementada en este kernel
# (devuelve exit code, útil para scripts que necesitan saber si pueden contar
# con cap_bpf, cap_perfmon, cap_checkpoint_restore, etc.)
capsh --supports=cap_bpf && echo "soportada"
# soportada

# Para enumerar todas, leer del header del kernel:
grep -E '^#define CAP_' /usr/include/linux/capability.h
# #define CAP_CHOWN              0
# #define CAP_DAC_OVERRIDE       1
# ...
# #define CAP_CHECKPOINT_RESTORE 40    ← la más nueva (kernel 5.9+)
# #define CAP_LAST_CAP           CAP_CHECKPOINT_RESTORE
# #define CAP_TO_INDEX(x)        ((x) >> 5)
# #define CAP_TO_MASK(x)         (1U << ((x) & 31))</code></pre>

          <p>El header trae 41 capabilities numeradas (CHOWN = 0 hasta CHECKPOINT_RESTORE = 40) más tres macros auxiliares que el kernel usa internamente:</p>

          <ul>
            <li><strong><code>CAP_LAST_CAP</code></strong> es un alias al cap más alto definido. Permite que el código del kernel y de userspace itere de <code>0</code> a <code>CAP_LAST_CAP</code> sin tener que actualizar el rango cada vez que se agrega una cap nueva.</li>
            <li><strong><code>CAP_TO_INDEX(x)</code></strong> calcula en qué <code>__u32</code> del bitset vive el bit del cap <code>x</code>. El estado de cada cap (Effective, Permitted, Bounding…) se guarda como un bitset de varios enteros de 32 bits — la macro hace el shift de 5 (división entera por 32) para obtener el índice del entero correcto.</li>
            <li><strong><code>CAP_TO_MASK(x)</code></strong> genera la máscara de bits dentro de ese <code>__u32</code>: hace <code>(1U &lt;&lt; (x % 32))</code>. Combinada con <code>CAP_TO_INDEX</code>, permite leer/escribir el bit de un cap específico con dos instrucciones.</li>
          </ul>

          <p>Cuál usar: <code>capsh --print</code> es para inspeccionar tu propia shell. <code>getpcaps &lt;pid&gt;</code> es lo que quieres para containers (te ahorra leer y decodificar el hex de <code>/proc/&lt;pid&gt;/status</code>). <code>getcap</code> es la única forma de descubrir capabilities pegadas a binarios en disco — útil para auditoría: si ves <code>cap_sys_admin=ep</code> en algún binario que no esperabas, es bandera roja.</p>

          <h2>Por qué root en un contenedor sigue siendo peligroso</h2>

          <p>Docker no usa el <a href="/tutorial/que-es-realmente-un-contenedor/namespaces#6-user-user-namespace">user namespace</a> por defecto. Eso significa que el UID 0 del contenedor mapea directamente al UID 0 del host. Si un proceso escapa del contenedor (por una vulnerabilidad en el runtime o en el kernel), llega al host como root real.</p>

          <p>Las capabilities mitigan esto parcialmente — sin <code>CAP_SYS_ADMIN</code> hay menos vectores de escape — pero la mitigación completa requiere activar el <a href="/tutorial/que-es-realmente-un-contenedor/namespaces#6-user-user-namespace">user namespace</a> (modo rootless) o usar un runtime con mayor aislamiento como <code>gVisor</code> o <code>kata-containers</code>.</p>

          <p>Un error común es creer que pasar <code>--user 1000:1000</code> convierte al contenedor en "rootless". No lo hace: ese flag solo cambia el UID efectivo del proceso <em>dentro</em> del contenedor, sin crear ningún user namespace. UID 1000 de dentro sigue siendo UID 1000 del host.</p>

          <pre><code># --user cambia el UID del proceso, pero NO crea un user namespace
docker run --rm --user 1000:1000 alpine id
# uid=1000 gid=1000 groups=1000

# El uid_map es identity: cada UID del contenedor = mismo UID del host
docker run --rm alpine cat /proc/self/uid_map
# 0  0  4294967295   ← no hay aislamiento de privilegio</code></pre>

          <p>Rootless <em>real</em> significa que el kernel mapea los UIDs del contenedor a un subrango no privilegiado del host. Tres caminos lo consiguen:</p>

          <ol>
            <li><strong>Docker rootless</strong> — se instala con <a href="https://docs.docker.com/engine/security/rootless/" target="_blank" rel="noopener">dockerd-rootless-setuptool.sh</a>. El daemon corre como usuario no privilegiado.</li>
            <li><strong>Docker con <code>--userns-remap=default</code></strong> — el daemon sigue siendo root, pero los contenedores corren con UIDs mapeados.</li>
            <li><strong>Podman ejecutado como usuario normal</strong> (sin <code>sudo</code>). <em>Con</em> <code>sudo</code> <strong>no</strong> es rootless: el mapeo vuelve a ser identity.</li>
          </ol>

          <pre><code># Podman como usuario normal: rootless REAL
podman run --rm alpine cat /proc/self/uid_map
# 0   1001    1       ← UID 0 del contenedor = UID 1001 del host
# 1  231072  65536    ← subrango asignado en /etc/subuid

# Podman con sudo: NO es rootless, mapeo identity (igual que Docker root)
sudo podman run --rm alpine cat /proc/self/uid_map
# 0  0  4294967295</code></pre>

          <p>El criterio que importa no es si el usuario es sudoer, sino el <strong>UID efectivo con el que se invoca el runtime</strong>. Para reproducir empíricamente los tres casos (root directo, usuario normal, sudoer con <code>sudo</code>) hay un script listo en <a href="/test-podman-userns.sh" download><code>test-podman-userns.sh</code></a>. El formato detallado del <code>uid_map</code> y el rol del <code>/etc/subuid</code> están en la <a href="/tutorial/que-es-realmente-un-contenedor/namespaces#6-user-user-namespace">sección de user namespace del capítulo anterior</a>.</p>
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

          <pre><code>Current: cap_chown,cap_dac_override,cap_fowner,cap_fsetid,cap_kill,
         cap_setgid,cap_setuid,cap_setpcap,cap_net_bind_service,
         cap_net_raw,cap_sys_chroot,cap_mknod,cap_audit_write,
         cap_setfcap=ep
Bounding set =cap_chown,cap_dac_override,cap_fowner,cap_fsetid,cap_kill,
              cap_setgid,cap_setuid,cap_setpcap,cap_net_bind_service,
              cap_net_raw,cap_sys_chroot,cap_mknod,cap_audit_write,cap_setfcap
Ambient set =
Current IAB: !cap_dac_read_search,!cap_linux_immutable,!cap_net_broadcast,
             !cap_net_admin,!cap_ipc_lock,!cap_ipc_owner,!cap_sys_module,
             !cap_sys_rawio,!cap_sys_ptrace,!cap_sys_pacct,!cap_sys_admin,
             !cap_sys_boot,!cap_sys_nice,!cap_sys_resource,!cap_sys_time,
             !cap_sys_tty_config,!cap_lease,!cap_audit_control,
             !cap_mac_override,!cap_mac_admin,!cap_syslog,!cap_wake_alarm,
             !cap_block_suspend,!cap_audit_read,!cap_perfmon,!cap_bpf,
             !cap_checkpoint_restore
Securebits: 00/0x0/1'b0 (no-new-privs=0)
 secure-noroot: no (unlocked)
 secure-no-suid-fixup: no (unlocked)
 secure-keep-caps: no (unlocked)
 secure-no-ambient-raise: no (unlocked)
uid=0(root) euid=0(root)
gid=0(root)
Guessed mode: HYBRID (4)</code></pre>

          <p>Two fields worth a closer look:</p>

          <ul>
            <li><strong><code>Bounding set</code></strong> — the hard ceiling. No capability outside this set can reappear, not even through a setuid binary. Docker makes it equal to <code>Current</code>, so "gaining" new capabilities from inside the container is impossible.</li>
            <li><strong><code>Current IAB</code></strong> — capabilities with a <code>!</code> prefix are <em>explicitly denied</em> in Inheritable/Ambient/Bounding. That is where you see everything Docker drops by default: <code>cap_sys_admin</code>, <code>cap_sys_ptrace</code>, <code>cap_net_admin</code>, <code>cap_sys_module</code>, <code>cap_bpf</code>, <code>cap_checkpoint_restore</code>, etc.</li>
          </ul>

          <p>The dangerous ones are excluded: <code>CAP_SYS_ADMIN</code>, <code>CAP_SYS_PTRACE</code>, <code>CAP_NET_ADMIN</code>, <code>CAP_SYS_MODULE</code>. This means that even as UID 0 inside the container, you cannot mount arbitrary filesystems, load kernel modules, or debug processes in other namespaces.</p>

          <h2>Adding and dropping capabilities</h2>

          <pre><code># Add: allows ping without being root
docker run --rm --cap-add NET_RAW alpine ping -c1 8.8.8.8
# PING 8.8.8.8 (8.8.8.8): 56 data bytes
# 64 bytes from 8.8.8.8: seq=0 ttl=115 time=12.470 ms

# Drop CAP_CHOWN from nginx: the container DOES NOT start.
# nginx needs chown() at startup to prepare its cache directories.
docker run --rm --cap-drop CHOWN nginx:alpine
# 2026/04/21 07:43:35 [emerg] 1#1: chown("/var/cache/nginx/client_temp", 101)
# failed (1: Operation not permitted)
# nginx: [emerg] chown("/var/cache/nginx/client_temp", 101) failed (1: ...)
#
# Lesson: "dropping capabilities" is not free. You must know which
# privileged syscalls the binary uses before stripping privileges.

# Example that DOES work: demonstrate the block without killing the container.
# Create a file and check that chown fails with and without CAP_CHOWN.
docker run --rm alpine sh -c "touch /tmp/f && chown 1000 /tmp/f && echo OK"
# OK                                    ← with default CHOWN, it works

docker run --rm --cap-drop CHOWN alpine sh -c "touch /tmp/f && chown 1000 /tmp/f"
# chown: /tmp/f: Operation not permitted  ← without CHOWN, the kernel blocks it

# Minimal mode: no capabilities at all — useful as a security baseline.
# sh starts because it does not need any privilege.
docker run --rm --cap-drop ALL alpine sh
# /             (the shell starts normally)</code></pre>

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

          <h2>How to list capabilities on Linux</h2>

          <p>There are four common tools depending on what you need to inspect — all from the <code>libcap2-bin</code> (Ubuntu/Debian) or <code>libcap</code> (Alpine) package:</p>

          <p><strong>1. The current process's capabilities</strong> (direct kernel read):</p>

          <pre><code>capsh --print
# Current: =ep                     ← unrestricted root; "=ep" means
#                                    "every supported cap, in e+p"
# Bounding set =cap_chown,cap_dac_override,...,cap_checkpoint_restore
# Ambient set =
# Current IAB:                     ← empty for unrestricted root
# Securebits: 00/0x0/1'b0 (no-new-privs=0)
#  secure-noroot: no (unlocked)
#  secure-no-suid-fixup: no (unlocked)
#  secure-keep-caps: no (unlocked)
#  secure-no-ambient-raise: no (unlocked)
# uid=0(root) euid=0(root)
# gid=0(root)
# Guessed mode: HYBRID (4)</code></pre>

          <p>The <code>=ep</code> notation in <code>Current</code> is a compact form for "every supported capability, marked as both Effective and Permitted". When the process holds an explicit subset (such as a Docker container), <code>Current</code> prints as a list: <code>cap_chown,cap_kill,...=ep</code>.</p>

          <p><strong>2. Capabilities of a process by PID</strong> (human-friendly view of <code>/proc/&lt;pid&gt;/status</code>):</p>

          <pre><code>getpcaps 1
# 1: =ep    ← PID 1 (init) holds them all on a non-hardened host

getpcaps $(pgrep nginx)
# 75563: cap_chown,cap_dac_override,cap_fowner,...,cap_setfcap=ep
# 75597: =                        ← zero capabilities!</code></pre>

          <p>That second PID with an empty <code>=</code> reveals nginx's classic privilege-separation pattern: the <strong>master</strong> starts with the caps it needs (<code>cap_net_bind_service</code> to bind port 80), forks the <strong>workers</strong>, and the workers drop every cap before they start serving traffic. If an attacker compromises a worker, there are no capabilities to escalate — and the worker cannot open new privileged sockets.</p>

          <p><strong>3. Capabilities attached to a binary on disk</strong> (file capabilities — extended filesystem attributes):</p>

          <pre><code>getcap -r /usr/bin 2>/dev/null
# /usr/bin/mtr-packet  cap_net_raw=ep
# /usr/bin/ping        cap_net_raw=ep
#
# That is why ping works without sudo: it is not setuid root, it has
# cap_net_raw stuck to the executable. setcap/getcap manage those attrs.</code></pre>

          <p>On systems with rootless containers configured, you'll also see <code>newuidmap</code> and <code>newgidmap</code> with <code>cap_setuid</code>/<code>cap_setgid</code>. The exact list depends on which tools your distro installed.</p>

          <p><strong>4. The full list of capabilities the kernel supports</strong>:</p>

          <pre><code># --supports checks whether a specific cap is implemented in this kernel
# (returns an exit code; useful for scripts that need to know whether they
# can rely on cap_bpf, cap_perfmon, cap_checkpoint_restore, etc.)
capsh --supports=cap_bpf && echo "supported"
# supported

# To enumerate them all, read the kernel header:
grep -E '^#define CAP_' /usr/include/linux/capability.h
# #define CAP_CHOWN              0
# #define CAP_DAC_OVERRIDE       1
# ...
# #define CAP_CHECKPOINT_RESTORE 40    ← the newest one (kernel 5.9+)
# #define CAP_LAST_CAP           CAP_CHECKPOINT_RESTORE
# #define CAP_TO_INDEX(x)        ((x) >> 5)
# #define CAP_TO_MASK(x)         (1U << ((x) & 31))</code></pre>

          <p>The header carries 41 numbered capabilities (CHOWN = 0 through CHECKPOINT_RESTORE = 40) plus three helper macros the kernel uses internally:</p>

          <ul>
            <li><strong><code>CAP_LAST_CAP</code></strong> is an alias for the highest-defined cap. It lets kernel and userspace code iterate from <code>0</code> to <code>CAP_LAST_CAP</code> without having to update the upper bound every time a new cap is added.</li>
            <li><strong><code>CAP_TO_INDEX(x)</code></strong> computes which <code>__u32</code> in the bitset holds the bit for cap <code>x</code>. Each cap's state (Effective, Permitted, Bounding…) lives in a bitset spread across several 32-bit integers — the macro shifts right by 5 (integer divide by 32) to get the right one.</li>
            <li><strong><code>CAP_TO_MASK(x)</code></strong> generates the bitmask within that <code>__u32</code>: it computes <code>(1U &lt;&lt; (x % 32))</code>. Combined with <code>CAP_TO_INDEX</code>, it lets you read/write a specific cap's bit with two instructions.</li>
          </ul>

          <p>Which to use: <code>capsh --print</code> for inspecting your own shell. <code>getpcaps &lt;pid&gt;</code> is what you want for containers (it saves you reading and decoding the hex from <code>/proc/&lt;pid&gt;/status</code>). <code>getcap</code> is the only way to discover capabilities attached to disk binaries — useful for auditing: if you spot <code>cap_sys_admin=ep</code> on a binary you didn't expect, that's a red flag.</p>

          <h2>Why root inside a container is still dangerous</h2>

          <p>Docker does not use the <a href="/tutorial/que-es-realmente-un-contenedor/namespaces#6-user-user-namespace">user namespace</a> by default. That means the container's UID 0 maps directly to UID 0 on the host. If a process escapes the container (through a vulnerability in the runtime or kernel), it lands on the host as real root.</p>

          <p>Capabilities partially mitigate this — without <code>CAP_SYS_ADMIN</code> there are fewer escape vectors — but full mitigation requires enabling the <a href="/tutorial/que-es-realmente-un-contenedor/namespaces#6-user-user-namespace">user namespace</a> (rootless mode) or using a runtime with stronger isolation such as <code>gVisor</code> or <code>kata-containers</code>.</p>

          <p>A common misconception is that <code>--user 1000:1000</code> turns the container "rootless". It does not: that flag only changes the effective UID of the process <em>inside</em> the container, without creating any user namespace. UID 1000 inside is still UID 1000 on the host.</p>

          <pre><code># --user changes the process UID, but does NOT create a user namespace
docker run --rm --user 1000:1000 alpine id
# uid=1000 gid=1000 groups=1000

# The uid_map is identity: every container UID == same host UID
docker run --rm alpine cat /proc/self/uid_map
# 0  0  4294967295   ← no privilege isolation</code></pre>

          <p><em>Real</em> rootless means the kernel maps container UIDs to an unprivileged subrange on the host. Three paths give you that:</p>

          <ol>
            <li><strong>Docker rootless</strong> — installed via <a href="https://docs.docker.com/engine/security/rootless/" target="_blank" rel="noopener">dockerd-rootless-setuptool.sh</a>. The daemon runs as an unprivileged user.</li>
            <li><strong>Docker with <code>--userns-remap=default</code></strong> — the daemon is still root, but containers run with mapped UIDs.</li>
            <li><strong>Podman run as a regular user</strong> (no <code>sudo</code>). <em>With</em> <code>sudo</code>, it is <strong>not</strong> rootless: the mapping reverts to identity.</li>
          </ol>

          <pre><code># Podman as a regular user: REAL rootless
podman run --rm alpine cat /proc/self/uid_map
# 0   1001    1       ← container UID 0 = host UID 1001
# 1  231072  65536    ← subrange allocated in /etc/subuid

# Podman with sudo: NOT rootless, identity mapping (same as Docker as root)
sudo podman run --rm alpine cat /proc/self/uid_map
# 0  0  4294967295</code></pre>

          <p>The criterion that matters is not whether the user is a sudoer, but the <strong>effective UID that invokes the runtime</strong>. You can reproduce the three cases (direct root, regular user, sudoer with <code>sudo</code>) empirically with the <a href="/test-podman-userns.sh" download><code>test-podman-userns.sh</code></a> script. The detailed <code>uid_map</code> format and the role of <code>/etc/subuid</code> are covered in the <a href="/tutorial/que-es-realmente-un-contenedor/namespaces#6-user-user-namespace">user namespace section of the previous chapter</a>.</p>
        `,
}
