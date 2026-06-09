export default {
  es: `
          <p>Hay un contenedor en cada Pod que nunca aparece en tu <code>kubectl get pods</code>, que no escribes en tu YAML, y que es el primero en arrancar y el último en morir. Se llama <code>pause</code>, y es el motivo por el que un Pod puede existir como concepto.</p>

          <h2>El problema que resuelve</h2>

          <p>Cuando diseñaron Pods, los ingenieros de Kubernetes enfrentaron un problema fundamental: los namespaces de Linux pertenecen a procesos. Si quieres que dos contenedores compartan un namespace de red, alguien tiene que <em>crear</em> ese namespace y mantenerlo vivo aunque los contenedores de la aplicación terminen y se reinicien.</p>

          <p>La solución fue un proceso separado, mínimo y estable, cuyo único trabajo es sostener los namespaces del Pod. Ese proceso es el contenedor <code>pause</code>.</p>

          <h2>¿Qué hace el contenedor pause?</h2>

          <p>Literalmente nada, y eso es por diseño. Su <a href="https://github.com/kubernetes/kubernetes/blob/master/build/pause/linux/pause.c" target="_blank" rel="noopener noreferrer">código fuente en C</a> tiene 68 líneas en total, incluyendo licencia y comentarios:</p>

          <pre><code>#include &lt;signal.h&gt;
#include &lt;stdio.h&gt;
#include &lt;stdlib.h&gt;
#include &lt;sys/types.h&gt;
#include &lt;sys/wait.h&gt;
#include &lt;unistd.h&gt;

static void sigdown(int signo) {
  psignal(signo, "Shutting down, got signal");
  exit(0);
}

static void sigreap(int signo) {
  while (waitpid(-1, NULL, WNOHANG) > 0)   // Reaper: evita procesos zombie
    ;
}

int main(int argc, char **argv) {
  if (getpid() != 1)
    fprintf(stderr, "Warning: pause should be the first process\n");

  sigaction(SIGINT,  &(struct sigaction){.sa_handler = sigdown}, NULL);
  sigaction(SIGTERM, &(struct sigaction){.sa_handler = sigdown}, NULL);
  sigaction(SIGCHLD, &(struct sigaction){.sa_handler = sigreap,
                                         .sa_flags = SA_NOCLDSTOP}, NULL);
  for (;;)
    pause();  // Duerme indefinidamente, sin consumir CPU
  return 42;
}</code></pre>

          <div class="callout callout-info">
            <strong>El reaper de zombies:</strong> El contenedor pause también maneja <code>SIGCHLD</code>, lo que lo convierte en el PID 1 del Pod. En Linux, cuando un proceso padre muere antes que sus hijos, esos hijos son adoptados por PID 1. Si PID 1 no llama a <code>waitpid()</code>, los hijos terminados se quedan como procesos zombie. El pause los recolecta.
          </div>

          <h2>La imagen de pause</h2>

          <p>El <a href="https://github.com/kubernetes/kubernetes/blob/master/build/pause/Dockerfile" target="_blank" rel="noopener noreferrer">Dockerfile</a> lo dice todo:</p>

          <pre><code>ARG BASE
FROM \${BASE}
ARG ARCH
ADD bin/pause-linux-\${ARCH} /pause
USER 65535:65535
ENTRYPOINT ["/pause"]</code></pre>

          <p>Sin shell, sin utilidades, sin nada más que el binario <code>/pause</code> compilado estáticamente. No puedes ejecutar <code>ls</code> adentro porque no existe — intentarlo deja el proceso colgado hasta que Ctrl+C dispara el handler de SIGINT. Para inspeccionar el filesystem, lo extraemos como hicimos con Alpine en el <em><a href="/tutorial/que-es-realmente-un-contenedor/construyendo-un-contenedor">tutorial anterior</a></em>:</p>

          <pre><code>docker create --name pause-inspect registry.k8s.io/pause:3.9
mkdir -p /tmp/pause && docker export pause-inspect | tar -xC /tmp/pause
docker rm pause-inspect

tree /tmp/pause
# .
# ├── dev
# │   ├── console
# │   ├── pts
# │   └── shm
# ├── etc
# │   ├── hostname
# │   ├── hosts
# │   ├── mtab -> /proc/mounts
# │   └── resolv.conf
# ├── pause
# ├── proc
# └── sys</code></pre>

          <p>Inspeccionamos cada archivo:</p>

          <pre><code>cat /tmp/pause/etc/hostname    # vacío
cat /tmp/pause/etc/hosts       # vacío
cat /tmp/pause/etc/resolv.conf # vacío
ls  /tmp/pause/proc/           # vacío

# etc/mtab es un symlink a /proc/mounts.
# Fuera del contenedor el symlink resuelve al /proc/mounts del host,
# por eso parece tener contenido. Una vez que kubelet monte /proc
# dentro del namespace del Pod, resolverá al /proc/mounts propio.

# El binario pause es un ELF estático:
cat -v /tmp/pause/pause | head -1
# ^?ELF^B^A^A^C ...   ← cabecera ELF, binario compilado estáticamente</code></pre>

          <p>Un binario ELF de 743 KB y un esqueleto de filesystem completamente vacío. Los directorios <code>dev/</code>, <code>proc/</code> y <code>sys/</code> son puntos de montaje que el runtime llenará en tiempo de ejecución. Los archivos de <code>etc/</code> los sobreescribirá kubelet con los datos del Pod (hostname, DNS). La imagen en sí no contiene nada más que el binario.</p>

          <h2>Cómo kubelet usa el contenedor pause</h2>

          <p>Cuando kubelet recibe la instrucción de crear un Pod, sigue esta secuencia:</p>

          <ol>
            <li>Llama al container runtime (containerd) para crear el contenedor <code>pause</code> con todos los namespaces del Pod: red, IPC, UTS.</li>
            <li>El runtime crea un network namespace nuevo, configura la interfaz <code>eth0</code> y le asigna la IP del Pod.</li>
            <li>Para cada contenedor definido en el spec, kubelet crea el contenedor indicándole que <em>se una</em> al namespace de red del contenedor pause (<code>--net=container:&lt;pause-id&gt;</code>).</li>
            <li>Los contenedores de la aplicación arrancan ya con la red configurada, sin tener que hacer nada ellos mismos.</li>
          </ol>

          <pre><code># Esto es lo que hace internamente (equivalente conceptual con Docker):

# 1. Arrancar el contenedor pause (crea y sostiene los namespaces)
docker run -d --name pause \\
  --net=none \\       # Sin red todavía, CNI la configura después
  registry.k8s.io/pause:3.9

# 2. El plugin CNI configura la red en el namespace del pause
# (crea veth pair, asigna IP, configura rutas)

# 3. Los contenedores de la app se unen a los namespaces del pause
docker run -d --name app \\
  --net=container:pause \\   # Comparte red con pause
  --ipc=container:pause \\   # Comparte IPC con pause
  nginx:alpine</code></pre>

          <h2>Verificando el pause en un cluster real</h2>

          <p>Empezamos levantando un Pod simple:</p>

          <pre><code>kubectl run nginx --image=nginx
# pod/nginx created

kubectl get pod nginx
# NAME    READY   STATUS    RESTARTS   AGE
# nginx   1/1     Running   0          10s</code></pre>

          <p>Ahora entramos al nodo y buscamos el pause. El primer intento intuitivo es <code>crictl ps</code> — pero no aparece:</p>

          <pre><code>crictl ps
# CONTAINER       IMAGE               STATE   NAME     POD
# 37221f4dbe035   nginx:latest        Running nginx    nginx          ← solo app containers
# fd492c6850486   alpine:latest       Running sidecar  test-restart</code></pre>

          <p><code>crictl</code> filtra los pod sandboxes por diseño. Para verlos hay que usar <code>crictl pods</code>, que lista los sandboxes directamente — cada entrada es un contenedor pause:</p>

          <pre><code>crictl pods
# POD ID        STATE  NAME          NAMESPACE
# 646f857e8367a Ready  nginx         default
# c1fda029d8005 Ready  test-restart  default</code></pre>

          <p>O bien usar <code>ctr</code>, el cliente nativo de containerd. Por defecto apunta al namespace <code>default</code> — los contenedores de Kubernetes viven en el namespace <code>k8s.io</code>:</p>

          <pre><code>ctr c list          # vacío — apunta al namespace default
ctr namespaces list # NAME / k8s.io

ctr -n k8s.io c list
# CONTAINER                IMAGE                        RUNTIME
# 00e7e9ae18f0...          registry.k8s.io/pause:3.5   io.containerd.runc.v2
# 37221f4dbe035...         docker.io/library/nginx      io.containerd.runc.v2
# c1fda029d8005...         registry.k8s.io/pause:3.5   io.containerd.runc.v2
# fd492c68504867...        docker.io/library/alpine     io.containerd.runc.v2
# ...</code></pre>

          <p>Ahora el dato interesante. Obtenemos el PID del proceso nginx en el host y listamos sus namespaces:</p>

          <pre><code>crictl inspect 37221f4dbe035 | grep '"pid"'
# "pid": 1,       ← PID 1 dentro de su propio namespace
# "pid": 67452,   ← PID real en el host

ps -p 67452 -o pid,ppid,comm,args
# PID   PPID  COMMAND  ARGS
# 67452 67302 nginx    nginx: master process nginx -g daemon off;

# Ver todos los namespaces del proceso nginx como symlinks
ls -la /proc/67452/ns
# lrwxrwxrwx  cgroup          -> 'cgroup:[4026532671]'
# lrwxrwxrwx  ipc             -> 'ipc:[4026532667]'
# lrwxrwxrwx  mnt             -> 'mnt:[4026532669]'
# lrwxrwxrwx  net             -> 'net:[4026532603]'
# lrwxrwxrwx  pid             -> 'pid:[4026532670]'
# lrwxrwxrwx  pid_for_children -> 'pid:[4026532670]'
# lrwxrwxrwx  time            -> 'time:[4026531834]'
# lrwxrwxrwx  time_for_children -> 'time:[4026531834]'
# lrwxrwxrwx  user            -> 'user:[4026531837]'
# lrwxrwxrwx  uts             -> 'uts:[4026532666]'

# nginx solo POSEE 3 namespaces propios: mnt, pid, cgroup
lsns | grep nginx
# 4026532669 mnt    2 67452 root  nginx: master process...
# 4026532670 pid    2 67452 root  nginx: master process...
# 4026532671 cgroup 2 67452 root  nginx: master process...</code></pre>

          <p>Net, IPC y UTS no aparecen — nginx no los posee, solo se une a ellos. El dueño es el pause. Si tomamos el ID del netns de nginx (<code>net:[4026532603]</code>) y listamos todos los procesos que lo comparten:</p>

          <pre><code>lsns 4026532603
# PID   PPID  USER   COMMAND
# 67325 67302 65535  /pause                              ← dueño del namespace
# 67452 67302 root   nginx: master process nginx -g...   ← se une al namespace
# 67489 67452 ...    nginx: worker process</code></pre>

          <p>Y si listamos todos los namespaces del proceso pause:</p>

          <pre><code>lsns -p 67325
# NS          TYPE    PID   USER   COMMAND
# 4026532603  net       3  65535  /pause   ← dueño: net compartido del Pod
# 4026532665  mnt       1  65535  /pause   ← propio
# 4026532666  uts       3  65535  /pause   ← dueño: uts compartido del Pod
# 4026532667  ipc       3  65535  /pause   ← dueño: ipc compartido del Pod
# 4026532668  pid       1  65535  /pause   ← propio</code></pre>

          <p>Tres namespaces con <code>NPROCS=3</code> (net, uts, ipc): son los compartidos, que el pause sostiene y nginx hereda. Dos con <code>NPROCS=1</code> (mnt, pid): son propios del pause. El user 65535 confirma que corre como nobody — exactamente como indica el Dockerfile.</p>

          <h2>¿Qué pasa si el contenedor pause muere?</h2>

          <p>Si el contenedor pause muere, los namespaces desaparecen. La red del Pod se destruye. Kubelet tiene que recrear el Pod completo desde cero: un nuevo proceso pause con nuevos namespaces, nuevos contenedores uniéndose a ellos, y en muchos casos una nueva IP.</p>

          <p>Por eso el pause tiene que ser absolutamente estable. Un proceso que solo duerme es prácticamente imposible de crashear.</p>

          <h2>¿Por qué no simplemente compartir los namespaces del primer contenedor?</h2>

          <p>Es una pregunta válida. Docker ya permite hacer esto con <code>--net=container:&lt;id&gt;</code>. ¿Por qué Kubernetes no simplemente designa al primer contenedor del spec como el "dueño" de los namespaces y hace que los demás se unan a él?</p>

          <p>El problema es el ciclo de vida. En Kubernetes, los contenedores pueden crashear y reiniciarse de forma independiente. Cuando un contenedor muere, el runtime lo destruye y crea uno nuevo. Ese proceso nuevo tiene un PID diferente y, si fuera el dueño del namespace, ese namespace desaparecería con él.</p>

          <p>Antes de responder, una aclaración importante sobre PID 1 en un Pod:</p>

          <div class="callout callout-info">
            <strong>PID 1 dentro de un contenedor vs PID 1 del Pod:</strong> Por defecto cada contenedor tiene su propio namespace de PID. El proceso principal de la app <em>es</em> PID 1 dentro de ese namespace — pero no es el PID 1 global del Pod. El PID 1 del namespace compartido es <code>pause</code>. Además, el kernel de Linux ignora SIGKILL enviado a PID 1 desde dentro de su propio namespace, exactamente para evitar que un proceso destruya su propio init.
          </div>

          <p>Cuando el proceso principal de <code>app</code> muere, ese contenedor muere. Kubelet lo detecta y lo reinicia según <code>restartPolicy</code>. Pero reinicia <strong>solo ese contenedor</strong> — no el Pod completo. El contenedor <code>pause</code> sigue corriendo durante todo ese proceso, los namespaces permanecen intactos, y <code>sidecar</code> nunca pierde su conexión de red. Puedes verlo con <code>kubectl get pod -w</code>: el estado pasa a <code>1/2</code> mientras <code>app</code> se reinicia, luego vuelve a <code>2/2</code>. El Pod nunca se recreó.</p>

          <p>Ahora pensalo con la hipótesis original: ¿qué pasaría si el namespace de red perteneciera a <code>app</code> en lugar de a <code>pause</code>?</p>

          <ol>
            <li>El proceso de <code>app</code> muere — su namespace de red desaparece con él.</li>
            <li><code>sidecar</code> pierde su interfaz de red en el medio de una operación.</li>
            <li>Kubelet no puede reiniciar solo <code>app</code> — tiene que recrear el Pod completo para restablecer el namespace.</li>
          </ol>

          <p>Con <code>pause</code> como ancla esto no ocurre. <code>app</code> puede morir y reiniciarse diez veces — el namespace de red vive en <code>pause</code>, no en <code>app</code>. El único caso en que el Pod completo se reinicia es si <code>pause</code> muere, y <code>pause</code> nunca crashea porque no hace nada. Eso no es una limitación — es exactamente el diseño.</p>

          <p>Se puede verificar. Este Pod hace que <code>app</code> crashee cada 10 segundos intencionalmente:</p>

          <pre><code>apiVersion: v1
kind: Pod
metadata:
  name: test-restart
spec:
  containers:
    - name: app
      image: alpine
      command: ["sh", "-c", "echo app-start; sleep 10; exit 1"]
    - name: sidecar
      image: alpine
      command: ["sh", "-c", "while true; do date; sleep 2; done"]</code></pre>

          <pre><code>kubectl apply -f test-restart.yaml

# Observar en tiempo real
kubectl get pod test-restart -w
# NAME           READY   STATUS             RESTARTS
# test-restart   2/2     Running            0
# test-restart   1/2     Error              0   ← app cayó, sidecar sigue (READY 1/2)
# test-restart   1/2     CrashLoopBackOff   1
# test-restart   2/2     Running            1   ← solo app se reinició, Pod intacto

# Verificar que sidecar nunca se interrumpió
kubectl logs test-restart -c sidecar
# Los timestamps deben ser continuos sin ningún gap</code></pre>
        `,
  en: `
          <p>There is a container in every Pod that never shows up in your <code>kubectl get pods</code>, that you never write in your YAML, and that is the first to start and the last to die. It is called <code>pause</code>, and it is the reason a Pod can exist as a concept.</p>

          <h2>The problem it solves</h2>

          <p>When Kubernetes engineers designed Pods, they faced a fundamental problem: Linux namespaces belong to processes. If you want two containers to share a network namespace, something has to <em>create</em> that namespace and keep it alive even when the application containers exit and restart.</p>

          <p>The solution was a separate, minimal, stable process whose only job is to hold the Pod's namespaces open. That process is the <code>pause</code> container.</p>

          <h2>What does the pause container do?</h2>

          <p>Literally nothing, and that is by design. Its <a href="https://github.com/kubernetes/kubernetes/blob/master/build/pause/linux/pause.c" target="_blank" rel="noopener noreferrer">C source code</a> has 68 lines in total, including the license header and comments:</p>

          <pre><code>#include &lt;signal.h&gt;
#include &lt;stdio.h&gt;
#include &lt;stdlib.h&gt;
#include &lt;sys/types.h&gt;
#include &lt;sys/wait.h&gt;
#include &lt;unistd.h&gt;

static void sigdown(int signo) {
  psignal(signo, "Shutting down, got signal");
  exit(0);
}

static void sigreap(int signo) {
  while (waitpid(-1, NULL, WNOHANG) > 0)   // Reaper: prevents zombie processes
    ;
}

int main(int argc, char **argv) {
  if (getpid() != 1)
    fprintf(stderr, "Warning: pause should be the first process\n");

  sigaction(SIGINT,  &(struct sigaction){.sa_handler = sigdown}, NULL);
  sigaction(SIGTERM, &(struct sigaction){.sa_handler = sigdown}, NULL);
  sigaction(SIGCHLD, &(struct sigaction){.sa_handler = sigreap,
                                         .sa_flags = SA_NOCLDSTOP}, NULL);
  for (;;)
    pause();  // Sleeps indefinitely, consuming no CPU
  return 42;
}</code></pre>

          <div class="callout callout-info">
            <strong>The zombie reaper:</strong> The pause container also handles <code>SIGCHLD</code>, making it PID 1 of the Pod. In Linux, when a parent process dies before its children, those children are adopted by PID 1. If PID 1 does not call <code>waitpid()</code>, terminated children remain as zombie processes. pause collects them.
          </div>

          <h2>The pause image</h2>

          <p>The <a href="https://github.com/kubernetes/kubernetes/blob/master/build/pause/Dockerfile" target="_blank" rel="noopener noreferrer">Dockerfile</a> says it all:</p>

          <pre><code>ARG BASE
FROM \${BASE}
ARG ARCH
ADD bin/pause-linux-\${ARCH} /pause
USER 65535:65535
ENTRYPOINT ["/pause"]</code></pre>

          <p>No shell, no utilities, nothing but the statically compiled <code>/pause</code> binary. You cannot run <code>ls</code> inside it because it does not exist — trying to do so leaves the process hanging until Ctrl+C fires the SIGINT handler. To inspect the filesystem, we extract it the same way we did with Alpine in the <em><a href="/tutorial/que-es-realmente-un-contenedor/construyendo-un-contenedor">previous tutorial</a></em>:</p>

          <pre><code>docker create --name pause-inspect registry.k8s.io/pause:3.9
mkdir -p /tmp/pause && docker export pause-inspect | tar -xC /tmp/pause
docker rm pause-inspect

tree /tmp/pause
# .
# ├── dev
# │   ├── console
# │   ├── pts
# │   └── shm
# ├── etc
# │   ├── hostname
# │   ├── hosts
# │   ├── mtab -> /proc/mounts
# │   └── resolv.conf
# ├── pause
# ├── proc
# └── sys</code></pre>

          <p>Let's inspect each file:</p>

          <pre><code>cat /tmp/pause/etc/hostname    # empty
cat /tmp/pause/etc/hosts       # empty
cat /tmp/pause/etc/resolv.conf # empty
ls  /tmp/pause/proc/           # empty

# etc/mtab is a symlink to /proc/mounts.
# Outside the container the symlink resolves to the host's /proc/mounts,
# which is why it appears to have content. Once kubelet mounts /proc
# inside the Pod's namespace, it will resolve to the Pod's own /proc/mounts.

# The pause binary is a static ELF:
cat -v /tmp/pause/pause | head -1
# ^?ELF^B^A^A^C ...   ← ELF header, statically compiled binary</code></pre>

          <p>A 743 KB ELF binary and a completely empty filesystem skeleton. The <code>dev/</code>, <code>proc/</code>, and <code>sys/</code> directories are mount points the runtime will fill at execution time. The files in <code>etc/</code> will be overwritten by kubelet with the Pod's actual data (hostname, DNS). The image itself contains nothing beyond the binary.</p>

          <h2>How kubelet uses the pause container</h2>

          <p>When kubelet receives the instruction to create a Pod, it follows this sequence:</p>

          <ol>
            <li>It calls the container runtime (containerd) to create the <code>pause</code> container with all the Pod's namespaces: network, IPC, UTS.</li>
            <li>The runtime creates a new network namespace, configures the <code>eth0</code> interface, and assigns the Pod's IP address.</li>
            <li>For each container defined in the spec, kubelet creates the container telling it to <em>join</em> the pause container's network namespace (<code>--net=container:&lt;pause-id&gt;</code>).</li>
            <li>The application containers start up with the network already configured, without having to do anything themselves.</li>
          </ol>

          <pre><code># This is what happens internally (conceptual Docker equivalent):

# 1. Start the pause container (creates and holds the namespaces)
docker run -d --name pause \\
  --net=none \\       # No network yet, CNI configures it after
  registry.k8s.io/pause:3.9

# 2. The CNI plugin configures networking in the pause namespace
# (creates veth pair, assigns IP, sets up routes)

# 3. App containers join the pause namespaces
docker run -d --name app \\
  --net=container:pause \\   # Shares network with pause
  --ipc=container:pause \\   # Shares IPC with pause
  nginx:alpine</code></pre>

          <h2>Verifying pause in a real cluster</h2>

          <p>Start by spinning up a simple Pod:</p>

          <pre><code>kubectl run nginx --image=nginx
# pod/nginx created

kubectl get pod nginx
# NAME    READY   STATUS    RESTARTS   AGE
# nginx   1/1     Running   0          10s</code></pre>

          <p>Now SSH into the node and look for pause. The first intuitive attempt is <code>crictl ps</code> — but it does not show up:</p>

          <pre><code>crictl ps
# CONTAINER       IMAGE               STATE   NAME     POD
# 37221f4dbe035   nginx:latest        Running nginx    nginx          ← app containers only
# fd492c6850486   alpine:latest       Running sidecar  test-restart</code></pre>

          <p><code>crictl</code> filters out pod sandboxes by design. To see them you need <code>crictl pods</code>, which lists sandboxes directly — each entry is a pause container:</p>

          <pre><code>crictl pods
# POD ID        STATE  NAME          NAMESPACE
# 646f857e8367a Ready  nginx         default
# c1fda029d8005 Ready  test-restart  default</code></pre>

          <p>Or use <code>ctr</code>, containerd's native client. By default it points to the <code>default</code> namespace — Kubernetes containers live in the <code>k8s.io</code> namespace:</p>

          <pre><code>ctr c list          # empty — points to default namespace
ctr namespaces list # NAME / k8s.io

ctr -n k8s.io c list
# CONTAINER                IMAGE                        RUNTIME
# 00e7e9ae18f0...          registry.k8s.io/pause:3.5   io.containerd.runc.v2
# 37221f4dbe035...         docker.io/library/nginx      io.containerd.runc.v2
# c1fda029d8005...         registry.k8s.io/pause:3.5   io.containerd.runc.v2
# fd492c68504867...        docker.io/library/alpine     io.containerd.runc.v2
# ...</code></pre>

          <p>Now the interesting part. Get the nginx process PID on the host and list its namespaces:</p>

          <pre><code>crictl inspect 37221f4dbe035 | grep '"pid"'
# "pid": 1,       ← PID 1 inside its own namespace
# "pid": 67452,   ← real PID on the host

ps -p 67452 -o pid,ppid,comm,args
# PID   PPID  COMMAND  ARGS
# 67452 67302 nginx    nginx: master process nginx -g daemon off;

# View all namespaces of the nginx process as symlinks
ls -la /proc/67452/ns
# lrwxrwxrwx  cgroup           -> 'cgroup:[4026532671]'
# lrwxrwxrwx  ipc              -> 'ipc:[4026532667]'
# lrwxrwxrwx  mnt              -> 'mnt:[4026532669]'
# lrwxrwxrwx  net              -> 'net:[4026532603]'
# lrwxrwxrwx  pid              -> 'pid:[4026532670]'
# lrwxrwxrwx  pid_for_children -> 'pid:[4026532670]'
# lrwxrwxrwx  time             -> 'time:[4026531834]'
# lrwxrwxrwx  time_for_children -> 'time:[4026531834]'
# lrwxrwxrwx  user             -> 'user:[4026531837]'
# lrwxrwxrwx  uts              -> 'uts:[4026532666]'

# nginx only OWNS 3 namespaces: mnt, pid, cgroup
lsns | grep nginx
# 4026532669 mnt    2 67452 root  nginx: master process...
# 4026532670 pid    2 67452 root  nginx: master process...
# 4026532671 cgroup 2 67452 root  nginx: master process...</code></pre>

          <p>Net, IPC, and UTS do not appear — nginx does not own them, it only joins them. The owner is pause. If we take nginx's netns ID (<code>net:[4026532603]</code>) and list all processes sharing it:</p>

          <pre><code>lsns 4026532603
# PID   PPID  USER   COMMAND
# 67325 67302 65535  /pause                              ← namespace owner
# 67452 67302 root   nginx: master process nginx -g...   ← joins the namespace
# 67489 67452 ...    nginx: worker process</code></pre>

          <p>And listing all namespaces owned by the pause process:</p>

          <pre><code>lsns -p 67325
# NS          TYPE    PID   USER   COMMAND
# 4026532603  net       3  65535  /pause   ← owner: Pod's shared net
# 4026532665  mnt       1  65535  /pause   ← own
# 4026532666  uts       3  65535  /pause   ← owner: Pod's shared uts
# 4026532667  ipc       3  65535  /pause   ← owner: Pod's shared ipc
# 4026532668  pid       1  65535  /pause   ← own</code></pre>

          <p>Three namespaces with <code>NPROCS=3</code> (net, uts, ipc): the shared ones that pause holds and nginx inherits. Two with <code>NPROCS=1</code> (mnt, pid): pause's own. User 65535 confirms it runs as nobody — exactly as the Dockerfile specifies.</p>

          <h2>What happens if the pause container dies?</h2>

          <p>If the pause container dies, the namespaces disappear. The Pod's network is destroyed. Kubelet has to recreate the entire Pod from scratch: a new pause process with new namespaces, new containers joining them, and in many cases a new IP address.</p>

          <p>That is why pause has to be absolutely stable. A process that only sleeps is virtually impossible to crash.</p>

          <h2>Why not just share namespaces from the first container?</h2>

          <p>It is a valid question. Docker already allows this with <code>--net=container:&lt;id&gt;</code>. Why does Kubernetes not simply designate the first container in the spec as the namespace "owner" and have the others join it?</p>

          <p>The problem is the lifecycle. In Kubernetes, containers can crash and restart independently. When a container dies, the runtime destroys it and creates a new one. That new process has a different PID, and if it were the namespace owner, that namespace would disappear with it.</p>

          <p>Before answering, an important clarification about PID 1 in a Pod:</p>

          <div class="callout callout-info">
            <strong>PID 1 inside a container vs PID 1 of the Pod:</strong> By default each container has its own PID namespace. The application's main process <em>is</em> PID 1 inside that namespace — but it is not the global PID 1 of the Pod. The PID 1 of the shared namespace is <code>pause</code>. Also, the Linux kernel ignores SIGKILL sent to PID 1 from within its own namespace, precisely to prevent a process from destroying its own init.
          </div>

          <p>When <code>app</code>'s main process dies, that container dies. Kubelet detects it and restarts it according to <code>restartPolicy</code>. But it restarts <strong>only that container</strong> — not the entire Pod. The <code>pause</code> container stays running throughout, the namespaces remain intact, and <code>sidecar</code> never loses its network connection. You can watch this with <code>kubectl get pod -w</code>: the status drops to <code>1/2</code> while <code>app</code> restarts, then comes back to <code>2/2</code>. The Pod was never recreated.</p>

          <p>Now picture it with the original hypothesis: what would happen if the network namespace belonged to <code>app</code> instead of <code>pause</code>?</p>

          <ol>
            <li><code>app</code>'s process dies — its network namespace dies with it.</li>
            <li><code>sidecar</code> loses its network interface mid-operation.</li>
            <li>Kubelet cannot restart only <code>app</code> — it has to recreate the entire Pod to re-establish the namespace.</li>
          </ol>

          <p>With <code>pause</code> as the anchor this does not happen. <code>app</code> can die and restart ten times — the network namespace lives in <code>pause</code>, not in <code>app</code>. The only case in which the entire Pod restarts is if <code>pause</code> itself dies, and <code>pause</code> never crashes because it does nothing. That is not a limitation — it is exactly the design.</p>

          <p>You can verify it. This Pod makes <code>app</code> crash every 10 seconds intentionally:</p>

          <pre><code>apiVersion: v1
kind: Pod
metadata:
  name: test-restart
spec:
  containers:
    - name: app
      image: alpine
      command: ["sh", "-c", "echo app-start; sleep 10; exit 1"]
    - name: sidecar
      image: alpine
      command: ["sh", "-c", "while true; do date; sleep 2; done"]</code></pre>

          <pre><code>kubectl apply -f test-restart.yaml

# Watch in real time
kubectl get pod test-restart -w
# NAME           READY   STATUS             RESTARTS
# test-restart   2/2     Running            0
# test-restart   1/2     Error              0   ← app crashed, sidecar still up (READY 1/2)
# test-restart   1/2     CrashLoopBackOff   1
# test-restart   2/2     Running            1   ← only app restarted, Pod intact

# Verify sidecar was never interrupted
kubectl logs test-restart -c sidecar
# Timestamps must be continuous, with no gap</code></pre>
        `,
}
