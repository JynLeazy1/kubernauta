export default {
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

# Archivos de configuración del root cgroup
cgroup.controllers      cgroup.subtree_control  cgroup.stat
cgroup.max.depth        cgroup.threads          cgroup.procs
cgroup.max.descendants  cgroup.pressure

# Stats y métricas por recurso (en v1 estaban dispersas por subsistema)
cpu.pressure   cpu.stat          cpu.stat.local
io.pressure    io.stat           io.cost.model  io.cost.qos  io.prio.class
memory.pressure  memory.stat     memory.numa_stat
memory.reclaim   memory.zswap.writeback
cpuset.cpus.effective  cpuset.cpus.isolated  cpuset.mems.effective
misc.capacity  misc.current

# Mounts automáticos que systemd expone como cgroups hoja
dev-hugepages.mount   dev-mqueue.mount   proc-sys-fs-binfmt_misc.mount
sys-fs-fuse-connections.mount   sys-kernel-config.mount
sys-kernel-debug.mount   sys-kernel-tracing.mount

# Slices y scopes: la jerarquía real de procesos
init.scope/      ← PID 1 (systemd)
kubepods.slice/  ← creado por kubelet para todos los Pods (solo si corres K8s)
system.slice/    ← servicios de systemd
user.slice/      ← sesiones de usuario</code></pre>

          <p>Observa que todo convive en <strong>un solo directorio</strong>: configuración (<code>cgroup.*</code>), métricas (<code>cpu.pressure</code>, <code>memory.stat</code>), stats acumulativas y la jerarquía de procesos (<code>*.slice/</code>, <code>*.scope/</code>). En v1 habría que mirar cinco o seis directorios distintos para reunir la misma información.</p>

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

          <p>Todo lo que viste hasta aquí se deriva de una sola decisión arquitectónica. En <strong>v1</strong>, cada controlador tiene su propia jerarquía montada en su propio directorio (<code>/sys/fs/cgroup/cpu/</code>, <code>/sys/fs/cgroup/memory/</code>, <code>/sys/fs/cgroup/blkio/</code>, …). Un proceso puede estar en una ruta distinta en cada árbol — gestionarlos de forma consistente es un rompecabezas. En <strong>v2</strong> hay un único árbol bajo <code>/sys/fs/cgroup/</code> y los controladores se habilitan por cgroup vía <code>cgroup.subtree_control</code>; cada proceso vive en un solo lugar.</p>

          <p>De esa unificación salen las dos ganancias más visibles en producción:</p>

          <ul>
            <li><strong>PSI (<code>*.pressure</code>) solo existe en v2.</strong> Para responder "cuánto tiempo esperó este conjunto de procesos por CPU/memoria/I/O" necesitas que el conjunto esté definido sin ambigüedad — es decir, un árbol unificado. En v1 el mismo proceso podía estar en cgroups distintos según el controlador, así que "el cgroup" no tenía sentido único.</li>
            <li><strong>Las primitivas operativas</strong> (<code>cgroup.freeze</code>, <code>cgroup.kill</code>, <code>cgroup.subtree_control</code>) son todas v2. v1 tenía equivalentes para algunas, pero dispersos por controlador y con semántica inconsistente.</li>
          </ul>

          <p>Para saber cuál corre tu sistema:</p>

          <pre><code>stat -fc %T /sys/fs/cgroup/
# cgroup2fs   → v2 unificado
# tmpfs       → v1 (jerarquías separadas montadas sobre un tmpfs raíz)</code></pre>

          <p>El estado actual: Ubuntu 21.10+, Fedora 31+, Debian 11+ y RHEL 9+ usan v2 por defecto. Kubernetes soporta v2 desde 1.25 (GA) y lo prefiere desde 1.26. Si heredas un cluster con v1, toda la jerarquía sigue funcionando, pero pierdes PSI, <code>cgroup.kill</code> atómico y el mapeo 1:1 entre procesos y cgroup — razones suficientes para planear la migración.</p>

          <h2>Relación con Kubernetes</h2>

          <p>Kubernetes usa cgroups para implementar los <code>requests</code> y <code>limits</code> de los Pods. El mapeo de campos es:</p>

          <ul>
            <li><code>requests.cpu</code> → <code>cpu.shares</code> (v1) / <code>cpu.weight</code> (v2): un peso relativo que garantiza un mínimo.</li>
            <li><code>limits.cpu</code> → par <code>cpu.cfs_quota_us</code> + <code>cpu.cfs_period_us</code> (v1) / <code>cpu.max</code> (v2): un techo duro. En v1 el límite se expresa como dos archivos (cuánto tiempo de CPU y en qué ventana); en v2 ambos viven en una sola línea (<code>quota period</code>, p. ej. <code>50000 100000</code>).</li>
            <li><code>limits.memory</code> → <code>memory.limit_in_bytes</code> (v1) / <code>memory.max</code> (v2): al superarlo, el proceso recibe SIGKILL (OOM kill).</li>
          </ul>

          <h3>La jerarquía que kubelet construye en cada nodo</h3>

          <p>En un nodo de Kubernetes con cgroups v2, <code>kubelet</code> crea un slice raíz <code>kubepods.slice/</code> y lo divide por <a href="https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/" target="_blank" rel="noopener">QoS class</a>:</p>

          <pre><code>ls /sys/fs/cgroup/kubepods.slice/

kubepods-besteffort.slice/   ← Pods sin requests ni limits
kubepods-burstable.slice/    ← Pods con requests, y (opcionalmente) limits mayores
# kubepods-guaranteed.slice/ ← solo existe si hay Pods Guaranteed
cpu.max   cpu.weight   memory.max   memory.high   cpuset.cpus   ...</code></pre>

          <p>Dentro de cada slice de QoS, cada Pod obtiene su propio sub-slice con el UID del Pod (con guiones <code>-</code> convertidos a guiones bajos <code>_</code>):</p>

          <pre><code>ls /sys/fs/cgroup/kubepods.slice/kubepods-besteffort.slice/

kubepods-besteffort-pod59d55566_cfec_44b5_a4fa_4a85cc614d98.slice/
kubepods-besteffort-pod831093d6_349b_4e0f_a9ac_3247dd48fc94.slice/
kubepods-besteffort-pod95befcd1_4791_4a8f_a7a1_43053a0050c4.slice/
cpu.max   memory.max   io.max   pids.max   ...</code></pre>

          <p>Bajando un nivel más, dentro del slice del Pod aparecen los <strong>scopes de cada contenedor</strong> — el cgroup hoja donde el kernel aplica los límites reales:</p>

          <pre><code>ls /sys/fs/cgroup/kubepods.slice/kubepods-besteffort.slice/\\
   kubepods-besteffort-podb0f6dbac_47ea_494c_a4bb_dbb4656a862f.slice/

cri-containerd-3a9dd44529e63c649bdceea79056432992c97975ded1c111b63f2d0598bd27b6.scope/
cri-containerd-b2171cb14dceef68bd0b7d837d25a20a9bb7b8509fc57bb0c4a8552bd97370ff.scope/
cpu.max   memory.max   ...</code></pre>

          <p>Dos detalles que vale la pena subrayar:</p>

          <ul>
            <li><strong>Prefijo <code>cri-containerd-</code></strong>: el runtime CRI con containerd. Con Docker como runtime el prefijo es <code>docker-</code>; con CRI-O es <code>crio-</code>. El resto del nombre es el ID del contenedor.</li>
            <li><strong>Siempre hay ≥ 2 scopes por Pod</strong>, aun cuando tu YAML defina un solo contenedor. El primero corresponde al <code>pause</code> (sandbox), que mantiene vivos los namespaces compartidos del Pod; el segundo (o los demás) son tus contenedores de aplicación. El pause container se introduce en la <a href="/tutorial/que-es-realmente-un-contenedor/resumen">parte 9</a>.</li>
          </ul>

          <p>El cgroup hoja (el <code>.scope</code>) es donde viven los <code>limits</code> reales de cada contenedor. Las capas superiores — slice del Pod, slice de QoS, slice raíz — existen para agregar métricas y aplicar límites globales de la QoS, no los del contenedor individual.</p>

          <pre><code># Ver el cpu.max efectivo del contenedor de aplicación
cat /sys/fs/cgroup/kubepods.slice/kubepods-besteffort.slice/\\
    kubepods-besteffort-podb0f6dbac_..._a862f.slice/\\
    cri-containerd-b2171cb14d....scope/cpu.max
# max 100000    ← "max" porque el Pod es BestEffort (sin limits)

# Mismo archivo en un contenedor del Burstable con limits.cpu=500m
cat /sys/fs/cgroup/kubepods.slice/kubepods-burstable.slice/\\
    kubepods-burstable-podf4bbaf15_..._1483e.slice/\\
    cri-containerd-ed567c773e....scope/cpu.max
# 50000 100000 ← 50ms de cada 100ms = 0.5 core</code></pre>

          <p>Reglas que determinan la QoS class:</p>

          <ul>
            <li><strong>Guaranteed</strong>: todos los contenedores del Pod tienen <code>requests == limits</code> para CPU y memoria.</li>
            <li><strong>Burstable</strong>: al menos un contenedor tiene <code>requests</code> definidos, pero no cumple la regla de Guaranteed.</li>
            <li><strong>BestEffort</strong>: ningún contenedor tiene <code>requests</code> ni <code>limits</code>.</li>
          </ul>

          <p>Esto tiene una consecuencia operativa importante: los tres QoS definen el <strong>orden de eviction</strong> cuando el nodo tiene presión de memoria. BestEffort cae primero, Burstable después (si superan sus requests), Guaranteed solo si absolutamente no queda otra. Toda esa lógica se apoya en la estructura de slices que acabas de ver.</p>

          <p>Un detalle útil para debugging: cuando un Pod se schedulea en un nodo específico, su slice aparece <strong>solo</strong> en <code>/sys/fs/cgroup/kubepods.slice/</code> de ese nodo. Si corres <code>kubectl run nginx --image=nginx</code> y después entras por SSH a cada worker, verás el sub-slice del Pod en uno solo — el que ganó el scheduling.</p>

          <h3>Leer un contenedor en vivo</h3>

          <p>El scope del contenedor expone archivos que responden preguntas operativas comunes sin necesidad de entrar al contenedor ni instalar nada. Un pequeño diccionario con valores tomados de un contenedor real:</p>

          <pre><code>SCOPE=/sys/fs/cgroup/kubepods.slice/kubepods-burstable.slice/\\
kubepods-burstable-podf4bbaf15_..._1483e.slice/\\
cri-containerd-ed567c773e....scope

# ¿Cuánto ha consumido de CPU y me están throttling?
cat $SCOPE/cpu.stat
# usage_usec 20076856        ← 20s de CPU total
# user_usec 10484459
# system_usec 9592396
# nr_periods 0
# nr_throttled 0             ← cero throttling: no ha chocado con cpu.max
# throttled_usec 0
# nr_bursts 0

# ¿Qué peso relativo le dio kubelet (derivado de requests.cpu)?
cat $SCOPE/cpu.weight
# 11                         ← bajo (default sin requests = 100)

# ¿Cuánta memoria usa y cuál es el techo?
cat $SCOPE/memory.current  &amp;&amp;  cat $SCOPE/memory.max
# 16064512                   ← 15.3 MB usados
# 178257920                  ← 170 MB de techo (= limits.memory)

# Desglose: ¿la memoria es heap, code, kernel?
cat $SCOPE/memory.stat | head -5
# anon 13631488              ← 13 MB de heap/stack/mmap anónimos
# file 1789952               ← 1.7 MB de páginas file-backed (code, libs)
# kernel 634880              ← 634 KB de kernel memory
# kernel_stack 114688
# pagetables 249856

# ¿Cuántos procesos / hilos tiene, cuál es el techo?
cat $SCOPE/pids.current  &amp;&amp;  cat $SCOPE/pids.max
# 7                          ← 7 tasks vivos
# 2237                       ← techo (defensa contra fork-bomb)

# PSI: ¿está esperando por CPU/memoria/I/O?
cat $SCOPE/cpu.pressure
# some avg10=0.00 avg60=0.00 avg300=0.00 total=14334655
# full avg10=0.00 avg60=0.00 avg300=0.00 total=6199124</code></pre>

          <p>Tres señales que vale la pena aprender a leer de cabeza:</p>

          <ul>
            <li><strong><code>cpu.stat</code> → <code>nr_throttled</code> y <code>throttled_usec</code></strong>: si estos suben, tu <code>limits.cpu</code> es demasiado ajustado y el kernel está pausando al proceso. Es la causa #1 de latencias misteriosas en contenedores "que parecen tener CPU de sobra".</li>
            <li><strong><code>memory.current</code> vs <code>memory.max</code></strong>: la relación es tu cercanía al OOM kill. Si <code>memory.current</code> se acerca a <code>memory.max</code>, el siguiente pico de allocation dispara <code>OOMKilled</code> (el pod se reinicia).</li>
            <li><strong><code>*.pressure</code> (PSI)</strong>: el <code>avg10</code> es el termómetro en tiempo real. Un <code>avg10 &gt; 10</code> sostenido en cualquiera de los tres indica saturación activa — úsalo como señal para escalar, no esperes al OOM o al throttling.</li>
          </ul>

          <p>Todos esos archivos son parte de la interfaz estable del kernel. Herramientas como <code>cadvisor</code>, <code>node_exporter</code> o <code>metrics-server</code> son wrappers que leen exactamente esto y exportan los valores como métricas Prometheus.</p>

          <h3>Los límites en acción</h3>

          <p>Los archivos que leíste arriba cambian cuando el contenedor realmente se acerca a sus límites. Dos experimentos rápidos lo muestran en vivo con <a href="https://github.com/ColinIanKing/stress-ng" target="_blank" rel="noopener"><code>stress-ng</code></a>:</p>

          <p><strong>Forzar OOM con <code>memory.max</code>:</strong></p>

          <pre><code># Contenedor con 128 MB de techo que intenta usar 200 MB.
# OJO: --rm NO, porque destruye el cgroup en cuanto el contenedor termina
# y ya no puedes leer memory.events. En su lugar, --detach y lee en vivo.
docker run -d --name oom-test --memory=128m alpine \\
  sh -c "apk add -q stress-ng && stress-ng --vm 1 --vm-bytes 200M --vm-keep -t 30s"

CID=$(docker inspect oom-test --format '{{.Id}}')
SCOPE=/sys/fs/cgroup/system.slice/docker-\${CID}.scope

# Leer el conteo de OOM kills cada pocos segundos mientras corre:
watch -n 2 "cat \${SCOPE}/memory.events"

# Progresión típica (un snapshot por lectura, ~5s entre cada una):
# low        0
# high       0
# max        9164     → 14192 → 28958 → 41424 → 48882
# oom        79       → 120   → 237   → 320   → 374
# oom_kill   79       → 120   → 237   → 320   → 374
# oom_group_kill 0
#
# En 30s de stress-ng: 374 OOM kills y el kernel alcanzó memory.max
# casi 49 000 veces. stress-ng respawnea workers tras cada kill
# (por eso los contadores suben tan rápido con --vm-keep).</code></pre>

          <p><code>memory.events</code> es un contador acumulativo — útil para alertas ("si <code>oom</code> &gt; 0 en los últimos N minutos, el pod está al borde"). Kubernetes usa este mismo archivo para incrementar el contador de reinicios <code>OOMKilled</code>.</p>

          <p>Dos detalles sutiles del output:</p>

          <ul>
            <li><strong><code>oom</code> vs <code>oom_kill</code></strong>: el primero cuenta veces que el kernel <em>invocó</em> al OOM killer en este cgroup; el segundo cuenta procesos que <em>efectivamente murió</em>. Son casi iguales porque el killer casi siempre encuentra víctima, pero pueden diferir si el cgroup queda vacío entre medio.</li>
            <li><strong><code>oom_group_kill</code></strong> queda en 0 porque Docker no activa <code>memory.oom.group=1</code>. Con ese flag, un solo OOM mata a <em>todos</em> los procesos del cgroup de golpe. Kubernetes lo activa por defecto desde 1.28 para contenedores, así que en un Pod real verías este contador subir en vez de los individuales.</li>
          </ul>

          <p><strong>Forzar CPU throttling con <code>cpu.max</code>:</strong></p>

          <pre><code># Contenedor con solo 25% de 1 core, 4 worker threads peleando por CPU.
# Aquí --rm sí es seguro porque leemos cpu.stat mientras corre el test.
docker run -d --rm --name throttle-test --cpus=0.25 alpine \\
  sh -c "apk add -q stress-ng && stress-ng --cpu 4 -t 30s"

CID=$(docker inspect throttle-test --format '{{.Id}}')
SCOPE=/sys/fs/cgroup/system.slice/docker-\${CID}.scope

# Seguir el stat en vivo:
watch -n 2 "cat \${SCOPE}/cpu.stat"

# Progresión típica (un snapshot por lectura, ~5s apart):
# usage_usec       5371178 → 5696446 → 6846310 → 7321215 → 7646634
# user_usec        5156851 → 5479895 → 6614363 → 7081351 → 7405752
# system_usec       214326 →  216550 →  231946 →  239863 →  240882
# nr_periods           216 →     229 →     275 →     294 →     307
# nr_throttled         210 →     223 →     269 →     288 →     301
# throttled_usec  14985394 → 15939838 → 19273682 → 20651073 → 21596766
# nr_bursts 0

# PSI confirma la saturación
cat \${SCOPE}/cpu.pressure
# some avg10=75.12 avg60=45.33 avg300=12.04 total=21596766
# full avg10=74.98 avg60=45.20 avg300=11.98 total=21583512</code></pre>

          <p>El ratio <code>nr_throttled / nr_periods</code> es el porcentaje de ventanas en las que el kernel pausó al contenedor — en este run, 301/307 = <strong>98% de throttling</strong>. Los 4 workers piden CPU continuamente pero solo tienen 25% de un core disponible; el kernel los pausa 98 de cada 100 ventanas. Si ves esto en producción, tu <code>limits.cpu</code> está demasiado ajustado para la carga real, sin importar cuánta CPU "libre" haya en el nodo. Es la causa más común de latencias misteriosas en contenedores.</p>

          <p>Nota el crecimiento de <code>throttled_usec</code>: de 14.9s a 21.6s en ~5 segundos de reloj de pared. Cada segundo que pasa, el kernel añade ~1.5s de espera forzada — los 4 workers acumulan tiempo perdido más rápido de lo que transcurre el tiempo real.</p>

          <h3>Controles operativos: freeze y kill</h3>

          <p>Dos archivos del cgroup son write-only y ejecutan primitivas operacionales que probablemente usas todos los días vía Docker / Kubernetes, aunque nunca las hayas tecleado directamente.</p>

          <p><strong><code>cgroup.freeze</code></strong> pausa y reanuda todos los procesos del cgroup atómicamente. Es el mecanismo detrás de <code>docker pause</code>:</p>

          <pre><code># Contenedor que escribe un tick cada segundo
docker run -d --name freeze-test alpine sh -c \\
  'i=0; while true; do i=$((i+1)); echo "tick $i $(date +%T)"; sleep 1; done'

CID=$(docker inspect freeze-test --format '{{.Id}}')
SCOPE=/sys/fs/cgroup/system.slice/docker-\${CID}.scope

# Terminal A — sigue los logs en vivo
docker logs -f freeze-test &amp;
# tick 103 10:10:38
# tick 104 10:10:39
# (los ticks avanzan 1 por segundo)

# Terminal B — congelar el cgroup
echo 1 > \${SCOPE}/cgroup.freeze

# El kernel lo confirma
cat \${SCOPE}/cgroup.events
# populated 1
# frozen 1                   ← evidencia definitiva

# Esperar ~45 segundos...
echo 0 > \${SCOPE}/cgroup.freeze

# Ahora el log muestra el salto en los timestamps:
# tick 104 10:10:39
# tick 105 10:11:25          ← 46 segundos de gap real, no 1
# tick 106 10:11:26</code></pre>

          <p>Detalle sutil: <strong><code>docker ps</code> sigue reportando <code>STATUS: Up</code>, no <code>(Paused)</code></strong>, porque escribir a <code>cgroup.freeze</code> no toca el state machine de Docker. <code>docker pause</code> hace lo mismo internamente pero además actualiza el estado del contenedor en <code>dockerd</code>. Si congelas un contenedor por fuera, el kernel lo sabe, Docker no — útil saberlo si heredas un nodo con contenedores zombies.</p>

          <p><strong><code>cgroup.kill</code></strong> envía SIGKILL a todos los procesos del cgroup <strong>atómicamente</strong>, incluyendo los que aparezcan durante la operación. Es más seguro que un loop de <code>kill -9</code> PID por PID, que tiene condiciones de carrera:</p>

          <pre><code>echo 1 > \${SCOPE}/cgroup.kill
# Todos los PIDs del cgroup reciben SIGKILL de golpe.

docker ps --filter name=freeze-test
# (vacío)   ← el contenedor desapareció
#           Docker detecta que PID 1 murió y limpia el contenedor

# OJO: cgroup.kill es write-only; leerlo devuelve "Invalid argument"
cat \${SCOPE}/cgroup.kill
# cat: ...cgroup.kill: Invalid argument</code></pre>

          <p>Este es el mismo mecanismo que Kubernetes invoca cuando haces <code>kubectl delete pod --force --grace-period=0</code>: en vez de esperar a que el <code>preStop</code> hook termine y enviar SIGTERM → SIGKILL proceso por proceso, el kubelet le pide a containerd que escriba <code>1</code> al <code>cgroup.kill</code> del pod, y todo muere de golpe. Por eso <code>--force</code> es tan determinístico.</p>
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

# Root cgroup configuration files
cgroup.controllers      cgroup.subtree_control  cgroup.stat
cgroup.max.depth        cgroup.threads          cgroup.procs
cgroup.max.descendants  cgroup.pressure

# Stats and metrics per resource (v1 scattered these across subsystems)
cpu.pressure   cpu.stat          cpu.stat.local
io.pressure    io.stat           io.cost.model  io.cost.qos  io.prio.class
memory.pressure  memory.stat     memory.numa_stat
memory.reclaim   memory.zswap.writeback
cpuset.cpus.effective  cpuset.cpus.isolated  cpuset.mems.effective
misc.capacity  misc.current

# Automatic mounts exposed by systemd as leaf cgroups
dev-hugepages.mount   dev-mqueue.mount   proc-sys-fs-binfmt_misc.mount
sys-fs-fuse-connections.mount   sys-kernel-config.mount
sys-kernel-debug.mount   sys-kernel-tracing.mount

# Slices and scopes: the actual process hierarchy
init.scope/      ← PID 1 (systemd)
kubepods.slice/  ← created by kubelet for all Pods (only if K8s is running)
system.slice/    ← systemd services
user.slice/      ← user sessions</code></pre>

          <p>Notice how everything lives in <strong>one directory</strong>: configuration (<code>cgroup.*</code>), metrics (<code>cpu.pressure</code>, <code>memory.stat</code>), cumulative stats, and the process hierarchy (<code>*.slice/</code>, <code>*.scope/</code>). In v1 you had to look at five or six different directories to assemble the same information.</p>

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

          <p>Everything you've seen so far follows from one architectural decision. In <strong>v1</strong>, each controller has its own hierarchy mounted under its own directory (<code>/sys/fs/cgroup/cpu/</code>, <code>/sys/fs/cgroup/memory/</code>, <code>/sys/fs/cgroup/blkio/</code>, …). A process can sit at different positions in each tree — managing them consistently is a puzzle. In <strong>v2</strong> there is a single tree under <code>/sys/fs/cgroup/</code> and controllers are enabled per cgroup via <code>cgroup.subtree_control</code>; every process lives in exactly one place.</p>

          <p>That unification is what makes the two most visible wins possible:</p>

          <ul>
            <li><strong>PSI (<code>*.pressure</code>) only exists in v2.</strong> To answer "how long did this set of processes wait on CPU/memory/I/O", the set has to be defined unambiguously — i.e. in a unified tree. In v1 the same process could live in different cgroups depending on the controller, so "the cgroup" was not a single thing.</li>
            <li><strong>The operational primitives</strong> (<code>cgroup.freeze</code>, <code>cgroup.kill</code>, <code>cgroup.subtree_control</code>) are all v2. v1 had equivalents for some, but scattered across controllers and with inconsistent semantics.</li>
          </ul>

          <p>To tell which one your system runs:</p>

          <pre><code>stat -fc %T /sys/fs/cgroup/
# cgroup2fs   → unified v2
# tmpfs       → v1 (separate hierarchies mounted over a tmpfs root)</code></pre>

          <p>Current state: Ubuntu 21.10+, Fedora 31+, Debian 11+ and RHEL 9+ default to v2. Kubernetes has supported v2 since 1.25 (GA) and prefers it from 1.26 onwards. If you inherit a cluster on v1, the hierarchy still works, but you lose PSI, atomic <code>cgroup.kill</code>, and the 1:1 mapping between processes and cgroup — reasons enough to plan the migration.</p>

          <h2>Relationship with Kubernetes</h2>

          <p>Kubernetes uses cgroups to implement Pod <code>requests</code> and <code>limits</code>:</p>

          <ul>
            <li><code>requests.cpu</code> → <code>cpu.shares</code> (v1) / <code>cpu.weight</code> (v2): a relative weight that guarantees a minimum.</li>
            <li><code>limits.cpu</code> → pair <code>cpu.cfs_quota_us</code> + <code>cpu.cfs_period_us</code> (v1) / <code>cpu.max</code> (v2): a hard ceiling. In v1 the limit is expressed as two separate files (how much CPU time and over what window); in v2 both live on a single line (<code>quota period</code>, e.g. <code>50000 100000</code>).</li>
            <li><code>limits.memory</code> → <code>memory.limit_in_bytes</code> (v1) / <code>memory.max</code> (v2): when exceeded, the process receives SIGKILL (OOM kill).</li>
          </ul>

          <h3>The hierarchy kubelet builds on every node</h3>

          <p>On a Kubernetes node with cgroups v2, <code>kubelet</code> creates a root slice called <code>kubepods.slice/</code> and splits it by <a href="https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/" target="_blank" rel="noopener">QoS class</a>:</p>

          <pre><code>ls /sys/fs/cgroup/kubepods.slice/

kubepods-besteffort.slice/   ← Pods with no requests or limits
kubepods-burstable.slice/    ← Pods with requests and (optionally) higher limits
# kubepods-guaranteed.slice/ ← only appears if Guaranteed Pods exist
cpu.max   cpu.weight   memory.max   memory.high   cpuset.cpus   ...</code></pre>

          <p>Inside each QoS slice, every Pod gets its own sub-slice named with the Pod UID (hyphens <code>-</code> converted to underscores <code>_</code>):</p>

          <pre><code>ls /sys/fs/cgroup/kubepods.slice/kubepods-besteffort.slice/

kubepods-besteffort-pod59d55566_cfec_44b5_a4fa_4a85cc614d98.slice/
kubepods-besteffort-pod831093d6_349b_4e0f_a9ac_3247dd48fc94.slice/
kubepods-besteffort-pod95befcd1_4791_4a8f_a7a1_43053a0050c4.slice/
cpu.max   memory.max   io.max   pids.max   ...</code></pre>

          <p>Going one level deeper, inside the Pod slice you find the <strong>scopes of each container</strong> — the leaf cgroup where the kernel applies the actual limits:</p>

          <pre><code>ls /sys/fs/cgroup/kubepods.slice/kubepods-besteffort.slice/\\
   kubepods-besteffort-podb0f6dbac_47ea_494c_a4bb_dbb4656a862f.slice/

cri-containerd-3a9dd44529e63c649bdceea79056432992c97975ded1c111b63f2d0598bd27b6.scope/
cri-containerd-b2171cb14dceef68bd0b7d837d25a20a9bb7b8509fc57bb0c4a8552bd97370ff.scope/
cpu.max   memory.max   ...</code></pre>

          <p>Two details worth calling out:</p>

          <ul>
            <li><strong>The <code>cri-containerd-</code> prefix</strong>: the CRI runtime is containerd. With Docker as the runtime the prefix is <code>docker-</code>; with CRI-O it is <code>crio-</code>. The rest of the name is the container ID.</li>
            <li><strong>There are always ≥ 2 scopes per Pod</strong>, even when your YAML defines a single container. The first one belongs to the <code>pause</code> (sandbox) container that keeps the Pod's shared namespaces alive; the second (and beyond) are your application containers. The pause container is introduced in <a href="/tutorial/que-es-realmente-un-contenedor/resumen">Part 9</a>.</li>
          </ul>

          <p>The leaf cgroup (the <code>.scope</code>) is where each container's actual <code>limits</code> live. The upper layers — Pod slice, QoS slice, root slice — exist to aggregate metrics and enforce QoS-wide limits, not the individual container's.</p>

          <pre><code># Read the effective cpu.max of the application container
cat /sys/fs/cgroup/kubepods.slice/kubepods-besteffort.slice/\\
    kubepods-besteffort-podb0f6dbac_..._a862f.slice/\\
    cri-containerd-b2171cb14d....scope/cpu.max
# max 100000    ← "max" because the Pod is BestEffort (no limits)

# Same file on a Burstable container with limits.cpu=500m
cat /sys/fs/cgroup/kubepods.slice/kubepods-burstable.slice/\\
    kubepods-burstable-podf4bbaf15_..._1483e.slice/\\
    cri-containerd-ed567c773e....scope/cpu.max
# 50000 100000 ← 50ms out of every 100ms = 0.5 core</code></pre>

          <p>The rules that determine the QoS class:</p>

          <ul>
            <li><strong>Guaranteed</strong>: every container in the Pod has <code>requests == limits</code> for both CPU and memory.</li>
            <li><strong>Burstable</strong>: at least one container has <code>requests</code>, but the Guaranteed rule is not satisfied.</li>
            <li><strong>BestEffort</strong>: no container has <code>requests</code> or <code>limits</code>.</li>
          </ul>

          <p>This has an important operational consequence: the three QoS classes define the <strong>eviction order</strong> when a node is under memory pressure. BestEffort is evicted first, Burstable next (if it exceeds its requests), and Guaranteed only as a last resort. All of that logic is built on the slice structure you just saw.</p>

          <p>A debugging tip: a Pod's slice only shows up in <code>/sys/fs/cgroup/kubepods.slice/</code> on the node where it was scheduled. If you run <code>kubectl run nginx --image=nginx</code> and then SSH into each worker, the Pod's sub-slice appears on one of them — the winner of the scheduling decision.</p>

          <h3>Reading a live container</h3>

          <p>The container's scope exposes files that answer common operational questions without entering the container or installing anything. A mini-dictionary with values taken from a real container:</p>

          <pre><code>SCOPE=/sys/fs/cgroup/kubepods.slice/kubepods-burstable.slice/\\
kubepods-burstable-podf4bbaf15_..._1483e.slice/\\
cri-containerd-ed567c773e....scope

# How much CPU has it used, and is the kernel throttling it?
cat $SCOPE/cpu.stat
# usage_usec 20076856        ← 20s of total CPU
# user_usec 10484459
# system_usec 9592396
# nr_periods 0
# nr_throttled 0             ← zero throttling: hasn't hit cpu.max
# throttled_usec 0
# nr_bursts 0

# What relative weight did kubelet derive from requests.cpu?
cat $SCOPE/cpu.weight
# 11                         ← low (default without requests = 100)

# How much memory is it using, and what is the ceiling?
cat $SCOPE/memory.current  &amp;&amp;  cat $SCOPE/memory.max
# 16064512                   ← 15.3 MB used
# 178257920                  ← 170 MB ceiling (= limits.memory)

# Breakdown: is the memory heap, code, kernel?
cat $SCOPE/memory.stat | head -5
# anon 13631488              ← 13 MB of heap/stack/anonymous mmap
# file 1789952               ← 1.7 MB of file-backed pages (code, libs)
# kernel 634880              ← 634 KB of kernel memory
# kernel_stack 114688
# pagetables 249856

# How many processes / threads are alive, and what is the ceiling?
cat $SCOPE/pids.current  &amp;&amp;  cat $SCOPE/pids.max
# 7                          ← 7 live tasks
# 2237                       ← ceiling (fork-bomb defense)

# PSI: is it waiting on CPU/memory/I/O?
cat $SCOPE/cpu.pressure
# some avg10=0.00 avg60=0.00 avg300=0.00 total=14334655
# full avg10=0.00 avg60=0.00 avg300=0.00 total=6199124</code></pre>

          <p>Three signals worth learning to read at a glance:</p>

          <ul>
            <li><strong><code>cpu.stat</code> → <code>nr_throttled</code> and <code>throttled_usec</code></strong>: if these climb, your <code>limits.cpu</code> is too tight and the kernel is pausing the process. It is the #1 cause of mystery latency on containers "that seem to have spare CPU".</li>
            <li><strong><code>memory.current</code> vs <code>memory.max</code></strong>: the ratio is your distance to OOM kill. When <code>memory.current</code> closes in on <code>memory.max</code>, the next allocation spike triggers <code>OOMKilled</code> (the Pod restarts).</li>
            <li><strong><code>*.pressure</code> (PSI)</strong>: <code>avg10</code> is the real-time thermometer. A sustained <code>avg10 &gt; 10</code> on any of the three means active saturation — use it as a scale signal instead of waiting for OOM or throttling.</li>
          </ul>

          <p>All those files are part of the kernel's stable interface. Tools like <code>cadvisor</code>, <code>node_exporter</code> or <code>metrics-server</code> are wrappers that read exactly this and export the values as Prometheus metrics.</p>

          <h3>The limits in action</h3>

          <p>The files you just read change when the container actually approaches its limits. Two quick experiments show this live with <a href="https://github.com/ColinIanKing/stress-ng" target="_blank" rel="noopener"><code>stress-ng</code></a>:</p>

          <p><strong>Force an OOM with <code>memory.max</code>:</strong></p>

          <pre><code># Container capped at 128 MB trying to use 200 MB.
# NOTE: no --rm, because it destroys the cgroup as soon as the container
# exits and you can no longer read memory.events. Use --detach and
# read it live.
docker run -d --name oom-test --memory=128m alpine \\
  sh -c "apk add -q stress-ng && stress-ng --vm 1 --vm-bytes 200M --vm-keep -t 30s"

CID=$(docker inspect oom-test --format '{{.Id}}')
SCOPE=/sys/fs/cgroup/system.slice/docker-\${CID}.scope

# Read the OOM kill counter every few seconds while it runs:
watch -n 2 "cat \${SCOPE}/memory.events"

# Typical progression (one snapshot per read, ~5s apart):
# low        0
# high       0
# max        9164     → 14192 → 28958 → 41424 → 48882
# oom        79       → 120   → 237   → 320   → 374
# oom_kill   79       → 120   → 237   → 320   → 374
# oom_group_kill 0
#
# In 30s of stress-ng: 374 OOM kills and the kernel hit memory.max
# nearly 49,000 times. stress-ng respawns workers after each kill
# (that's why the counters climb so fast with --vm-keep).</code></pre>

          <p><code>memory.events</code> is a cumulative counter — useful for alerting ("if <code>oom</code> &gt; 0 in the last N minutes, the pod is on the edge"). Kubernetes uses this same file to bump the <code>OOMKilled</code> restart counter.</p>

          <p>Two subtle details from the output:</p>

          <ul>
            <li><strong><code>oom</code> vs <code>oom_kill</code></strong>: the first counts times the kernel <em>invoked</em> the OOM killer in this cgroup; the second counts processes that were actually <em>killed</em>. They are usually equal because the killer almost always finds a victim, but they can diverge if the cgroup becomes empty in between.</li>
            <li><strong><code>oom_group_kill</code></strong> stays at 0 because Docker does not set <code>memory.oom.group=1</code>. With that flag, a single OOM kills <em>every</em> process in the cgroup at once. Kubernetes enables it by default for containers since 1.28, so on a real Pod you would see this counter climb instead of the individual ones.</li>
          </ul>

          <p><strong>Force CPU throttling with <code>cpu.max</code>:</strong></p>

          <pre><code># Container with only 25% of 1 core, 4 worker threads fighting for CPU.
# Here --rm is safe because we read cpu.stat while the test runs.
docker run -d --rm --name throttle-test --cpus=0.25 alpine \\
  sh -c "apk add -q stress-ng && stress-ng --cpu 4 -t 30s"

CID=$(docker inspect throttle-test --format '{{.Id}}')
SCOPE=/sys/fs/cgroup/system.slice/docker-\${CID}.scope

# Follow the stat live:
watch -n 2 "cat \${SCOPE}/cpu.stat"

# Typical progression (one snapshot per read, ~5s apart):
# usage_usec       5371178 → 5696446 → 6846310 → 7321215 → 7646634
# user_usec        5156851 → 5479895 → 6614363 → 7081351 → 7405752
# system_usec       214326 →  216550 →  231946 →  239863 →  240882
# nr_periods           216 →     229 →     275 →     294 →     307
# nr_throttled         210 →     223 →     269 →     288 →     301
# throttled_usec  14985394 → 15939838 → 19273682 → 20651073 → 21596766
# nr_bursts 0

# PSI confirms the saturation
cat \${SCOPE}/cpu.pressure
# some avg10=75.12 avg60=45.33 avg300=12.04 total=21596766
# full avg10=74.98 avg60=45.20 avg300=11.98 total=21583512</code></pre>

          <p>The ratio <code>nr_throttled / nr_periods</code> is the percentage of windows in which the kernel paused the container — in this run, 301/307 = <strong>98% throttling</strong>. The 4 workers keep demanding CPU, but only 25% of one core is available; the kernel pauses them 98 out of every 100 windows. Seeing this in production means your <code>limits.cpu</code> is too tight for the actual load, regardless of how much "free" CPU is on the node. It is the most common cause of mystery latency in containers.</p>

          <p>Notice how <code>throttled_usec</code> grows: from 14.9s to 21.6s across ~5 seconds of wall-clock time. Every real second, the kernel adds ~1.5s of forced wait — the 4 workers accumulate lost time faster than actual time passes.</p>

          <h3>Operational controls: freeze and kill</h3>

          <p>Two files in the cgroup are write-only and implement operational primitives you probably use every day through Docker / Kubernetes, even though you have never typed them directly.</p>

          <p><strong><code>cgroup.freeze</code></strong> pauses and resumes every process in the cgroup atomically. It is the mechanism behind <code>docker pause</code>:</p>

          <pre><code># Container that writes a tick every second
docker run -d --name freeze-test alpine sh -c \\
  'i=0; while true; do i=$((i+1)); echo "tick $i $(date +%T)"; sleep 1; done'

CID=$(docker inspect freeze-test --format '{{.Id}}')
SCOPE=/sys/fs/cgroup/system.slice/docker-\${CID}.scope

# Terminal A — follow the logs live
docker logs -f freeze-test &amp;
# tick 103 10:10:38
# tick 104 10:10:39
# (ticks advance 1 per second)

# Terminal B — freeze the cgroup
echo 1 > \${SCOPE}/cgroup.freeze

# The kernel confirms
cat \${SCOPE}/cgroup.events
# populated 1
# frozen 1                   ← definitive evidence

# Wait ~45 seconds...
echo 0 > \${SCOPE}/cgroup.freeze

# The log now shows the jump in timestamps:
# tick 104 10:10:39
# tick 105 10:11:25          ← 46 seconds of real gap, not 1
# tick 106 10:11:26</code></pre>

          <p>Subtle detail: <strong><code>docker ps</code> keeps reporting <code>STATUS: Up</code>, not <code>(Paused)</code></strong>, because writing to <code>cgroup.freeze</code> does not touch Docker's state machine. <code>docker pause</code> does the same thing internally but also updates the container state in <code>dockerd</code>. If you freeze a container out-of-band, the kernel knows, Docker does not — useful to know when you inherit a node with zombie containers.</p>

          <p><strong><code>cgroup.kill</code></strong> sends SIGKILL to every process in the cgroup <strong>atomically</strong>, including any that appear during the operation. It is safer than a loop of <code>kill -9</code> PID by PID, which has race conditions:</p>

          <pre><code>echo 1 > \${SCOPE}/cgroup.kill
# Every PID in the cgroup receives SIGKILL at once.

docker ps --filter name=freeze-test
# (empty)   ← the container is gone
#           Docker notices PID 1 died and cleans up the container

# NOTE: cgroup.kill is write-only; reading it returns "Invalid argument"
cat \${SCOPE}/cgroup.kill
# cat: ...cgroup.kill: Invalid argument</code></pre>

          <p>This is the same mechanism Kubernetes uses for <code>kubectl delete pod --force --grace-period=0</code>: instead of waiting for the <code>preStop</code> hook to finish and sending SIGTERM → SIGKILL process by process, the kubelet asks containerd to write <code>1</code> to the pod's <code>cgroup.kill</code>, and everything dies at once. That is why <code>--force</code> is so deterministic.</p>
        `,
}
