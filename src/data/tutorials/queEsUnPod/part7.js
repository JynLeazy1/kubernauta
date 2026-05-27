export default {
  es: `
          <div class="callout callout-info">
            <strong>Nota sobre terminología:</strong> En esta sección usamos la palabra "volumen" para referirnos tanto a volúmenes efímeros (como <code>emptyDir</code>) como a volúmenes persistentes montados via PVC. La mecánica de compartir entre contenedores es la misma en ambos casos — la diferencia está en el ciclo de vida del dato, no en cómo el Pod lo usa.
          </div>

          <p>Ahora que sabes que todos los contenedores de un Pod viven en el mismo <a href="/tutorial/que-es-realmente-un-contenedor/namespaces#5-net-network-namespace">network namespace</a> (heredado del pause), el modelo multi-contenedor tiene sentido concreto. No es solo "varios procesos en el mismo Pod" — es varios procesos que comparten interfaces de red, pueden comunicarse por localhost, y ven el mismo filesystem de red. Lo que difiere entre contenedores es el namespace de PID y el <a href="/tutorial/que-es-realmente-un-contenedor/overlayfs">OverlayFS</a>.</p>

          <h2>Init containers</h2>

          <p>Los init containers son la herramienta para "preparación antes del arranque". Corren en secuencia, uno por uno, y el Pod no pasa a los contenedores regulares hasta que todos terminan con exit 0.</p>

          <pre><code>spec:
  initContainers:
    - name: wait-for-db
      image: busybox
      command: ["sh", "-c", "until nc -z db 5432; do sleep 1; done"]

    - name: migrate-db
      image: flyway:latest
      command: ["flyway", "migrate"]
      env:
        - name: FLYWAY_URL
          value: jdbc:postgresql://db:5432/myapp

  containers:
    - name: app
      image: my-app:1.0</code></pre>

          <p>A nivel de kernel, cada init container es un <code>CreateContainer</code> + <code>StartContainer</code> sobre el mismo <code>podSandboxID</code>. Comparte el namespace de red del pause (misma IP, mismo <code>eth0</code>), pero tiene su propio namespace de PID y su propio OverlayFS. Cuando termine, kubelet llama <code>StopContainer</code> y solo entonces empieza el siguiente.</p>

          <p>Un patrón común es usar un init container para escribir en un volumen que el contenedor principal lee al arrancar:</p>

          <pre><code>volumes:
  - name: config
    emptyDir: {}

initContainers:
  - name: render-config
    image: busybox
    command: ["sh", "-c", "echo 'server_name: prod' > /config/app.yaml"]
    volumeMounts:
      - name: config
        mountPath: /config

containers:
  - name: app
    image: my-app:1.0
    volumeMounts:
      - name: config
        mountPath: /etc/app</code></pre>

          <h2>El patrón sidecar</h2>

          <p>Un sidecar es un contenedor regular que corre en paralelo con el contenedor principal durante toda la vida del Pod. La razón por la que puede interceptar tráfico o leer logs es directamente el modelo de namespaces:</p>

          <ul>
            <li><strong>Misma red:</strong> ambos tienen el <code>eth0</code> del namespace del pause → pueden comunicarse por <code>localhost</code> y el sidecar puede interceptar puertos</li>
            <li><strong>Volúmenes compartidos:</strong> si montan el mismo volumen → el sidecar puede leer lo que escribe la app</li>
          </ul>

          <p>Ejemplo de log shipping con Fluentd:</p>

          <pre><code>spec:
  volumes:
    - name: logs
      emptyDir: {}

  containers:
    - name: app
      image: my-app:1.0
      volumeMounts:
        - name: logs
          mountPath: /var/log/app

    - name: log-shipper
      image: fluent/fluentd:v1.16
      volumeMounts:
        - name: logs
          mountPath: /var/log/app</code></pre>

          <p>La <code>app</code> escribe en <code>/var/log/app</code>. El <code>log-shipper</code> lee del mismo directorio. Ambos usan el mismo bind mount del volumen en el host — el kernel no duplica nada.</p>

          <h2>Service mesh: Istio y el namespace de red</h2>

          <p>El caso más sofisticado es un proxy de red como el sidecar de Istio. Istio inyecta automáticamente un contenedor <code>istio-proxy</code> (Envoy) en cada Pod del mesh via un admission webhook. Este proxy puede interceptar todo el tráfico del Pod porque comparte el namespace de red:</p>

          <pre><code>spec:
  containers:
    - name: app
      image: my-app:1.0

    - name: istio-proxy
      image: istio/proxyv2:1.20
      # Reconfigura iptables dentro del namespace de red del Pod
      # para redirigir todo el tráfico por el proxy</code></pre>

          <p>Istio usa un init container (<code>istio-init</code>) para configurar reglas de <code>iptables</code> dentro del namespace de red del Pod antes de que arranque la app. Como el namespace de red es compartido, esas reglas afectan a todos los contenedores. Para verificarlo en el nodo, primero consigues el inode del netns del Pod a través del PID del pause y después listas todos los procesos que comparten ese mismo inode:</p>

          <pre><code># Obtener el PID del pause (el contenedor sandbox del Pod)
PAUSE_PID=$(crictl inspect $(crictl pods --name my-app -q) | jq '.info.pid')

# Inode del netns que el pause sostiene
readlink /proc/\${PAUSE_PID}/ns/net
# net:[4026532603]

# Listar TODOS los procesos del nodo que viven en ese mismo netns:
lsns 4026532603
# NS         TYPE NPROCS   PID USER  COMMAND
# 4026532603 net       3 67325 65535 /pause                  ← dueño del netns
#                          67452 root  app
#                          67891 1337  envoy-proxy           ← mismo netns
#                                                              que pause y app</code></pre>

          <p>El <code>NPROCS=3</code> muestra que tres procesos comparten ese único network namespace. <code>iptables -t nat -L -n</code> ejecutado vía <code>nsenter -t \${PAUSE_PID} --net</code> muestra exactamente las reglas que <code>istio-init</code> instaló — afectan a todo el tráfico que sale o entra de cualquiera de los tres procesos.</p>

          <h2>Sidecar containers nativos (Kubernetes 1.29+)</h2>

          <p>Hasta Kubernetes 1.28, los sidecars eran contenedores regulares y había un problema: no había garantía de que arrancaran antes que el contenedor principal. Desde 1.29, existe el tipo sidecar nativo:</p>

          <pre><code>spec:
  initContainers:
    - name: envoy-proxy
      restartPolicy: Always   # ← esto lo convierte en sidecar nativo
      image: envoy:latest</code></pre>

          <p>Un init container con <code>restartPolicy: Always</code> se convierte en un <strong>sidecar container</strong> — arranca antes que los contenedores regulares (como init container), pero no termina cuando ellos arrancan (como contenedor regular). kubelet lo mantiene vivo durante todo el Pod y lo reinicia si muere. Veremos <code>restartPolicy</code> en detalle en la siguiente sección.</p>

          <div class="callout callout-warning">
            <strong>No abuses de los sidecars:</strong> Cada contenedor adicional consume sus propios recursos y añade complejidad al spec. Un DaemonSet para el agente de logs del nodo suele ser mejor que un sidecar en cada Pod.
          </div>
        `,
  en: `
          <div class="callout callout-info">
            <strong>A note on terminology:</strong> In this section we use the word "volume" to refer to both ephemeral volumes (like <code>emptyDir</code>) and persistent volumes mounted via PVC. The mechanics of sharing between containers are the same in both cases — the difference is in the data lifecycle, not in how the Pod uses it.
          </div>

          <p>Now that you know all containers in a Pod live in the same <a href="/tutorial/que-es-realmente-un-contenedor/namespaces#5-net-network-namespace">network namespace</a> (inherited from pause), the multi-container model makes concrete sense. It is not just "multiple processes in the same Pod" — it is multiple processes sharing network interfaces, communicating over localhost, and seeing the same network filesystem. What differs between containers is the PID namespace and the <a href="/tutorial/que-es-realmente-un-contenedor/overlayfs">OverlayFS</a>.</p>

          <h2>Init containers</h2>

          <p>Init containers are the tool for "preparation before startup". They run sequentially, one by one, and the Pod does not move to regular containers until all of them exit with code 0.</p>

          <pre><code>spec:
  initContainers:
    - name: wait-for-db
      image: busybox
      command: ["sh", "-c", "until nc -z db 5432; do sleep 1; done"]

    - name: migrate-db
      image: flyway:latest
      command: ["flyway", "migrate"]
      env:
        - name: FLYWAY_URL
          value: jdbc:postgresql://db:5432/myapp

  containers:
    - name: app
      image: my-app:1.0</code></pre>

          <p>At the kernel level, each init container is a <code>CreateContainer</code> + <code>StartContainer</code> on the same <code>podSandboxID</code>. It shares the pause's network namespace (same IP, same <code>eth0</code>), but has its own PID namespace and its own OverlayFS. When it exits, kubelet calls <code>StopContainer</code> and only then starts the next one.</p>

          <p>A common pattern is to use an init container to write to a volume that the main container reads at startup:</p>

          <pre><code>volumes:
  - name: config
    emptyDir: {}

initContainers:
  - name: render-config
    image: busybox
    command: ["sh", "-c", "echo 'server_name: prod' > /config/app.yaml"]
    volumeMounts:
      - name: config
        mountPath: /config

containers:
  - name: app
    image: my-app:1.0
    volumeMounts:
      - name: config
        mountPath: /etc/app</code></pre>

          <h2>The sidecar pattern</h2>

          <p>A sidecar is a regular container that runs in parallel with the main container for the entire lifetime of the Pod. The reason it can intercept traffic or read logs is directly the namespace model:</p>

          <ul>
            <li><strong>Same network:</strong> both have the pause's <code>eth0</code> → they can communicate over <code>localhost</code> and the sidecar can intercept ports</li>
            <li><strong>Shared volumes:</strong> if they mount the same volume → the sidecar can read what the app writes</li>
          </ul>

          <p>Log shipping example with Fluentd:</p>

          <pre><code>spec:
  volumes:
    - name: logs
      emptyDir: {}

  containers:
    - name: app
      image: my-app:1.0
      volumeMounts:
        - name: logs
          mountPath: /var/log/app

    - name: log-shipper
      image: fluent/fluentd:v1.16
      volumeMounts:
        - name: logs
          mountPath: /var/log/app</code></pre>

          <p>The <code>app</code> writes to <code>/var/log/app</code>. The <code>log-shipper</code> reads from the same directory. Both use the same bind mount of the volume on the host — the kernel duplicates nothing.</p>

          <h2>Service mesh: Istio and the network namespace</h2>

          <p>The most sophisticated case is a network proxy like the Istio sidecar. Istio automatically injects an <code>istio-proxy</code> container (Envoy) into every Pod in the mesh via an admission webhook. This proxy can intercept all of the Pod's traffic because it shares the network namespace:</p>

          <pre><code>spec:
  containers:
    - name: app
      image: my-app:1.0

    - name: istio-proxy
      image: istio/proxyv2:1.20
      # Reconfigures iptables inside the Pod's network namespace
      # to redirect all traffic through the proxy</code></pre>

          <p>Istio uses an init container (<code>istio-init</code>) to configure <code>iptables</code> rules inside the Pod's network namespace before the app starts. Because the network namespace is shared, those rules affect all containers. To verify it on the node, first get the netns inode through the pause's PID, then list every process sharing that inode:</p>

          <pre><code># Get the pause PID (the Pod's sandbox container)
PAUSE_PID=$(crictl inspect $(crictl pods --name my-app -q) | jq '.info.pid')

# Inode of the netns the pause holds
readlink /proc/\${PAUSE_PID}/ns/net
# net:[4026532603]

# List EVERY process on the node living in that netns:
lsns 4026532603
# NS         TYPE NPROCS   PID USER  COMMAND
# 4026532603 net       3 67325 65535 /pause                  ← netns owner
#                          67452 root  app
#                          67891 1337  envoy-proxy           ← same netns as
#                                                              pause and app</code></pre>

          <p><code>NPROCS=3</code> confirms three processes share that single network namespace. Running <code>iptables -t nat -L -n</code> via <code>nsenter -t \${PAUSE_PID} --net</code> shows exactly the rules <code>istio-init</code> installed — they affect all traffic in or out of any of the three processes.</p>

          <h2>Native sidecar containers (Kubernetes 1.29+)</h2>

          <p>Until Kubernetes 1.28, sidecars were regular containers and had a problem: there was no guarantee they would start before the main container. Since 1.29, there is a native sidecar type:</p>

          <pre><code>spec:
  initContainers:
    - name: envoy-proxy
      restartPolicy: Always   # ← this makes it a native sidecar
      image: envoy:latest</code></pre>

          <p>An init container with <code>restartPolicy: Always</code> becomes a <strong>sidecar container</strong> — it starts before regular containers (like an init container), but does not exit when they start (like a regular container). kubelet keeps it alive for the entire Pod lifetime and restarts it if it dies. We will cover <code>restartPolicy</code> in detail in the next section.</p>

          <div class="callout callout-warning">
            <strong>Do not overuse sidecars:</strong> Every additional container consumes its own resources and adds complexity to the spec. A DaemonSet for the node log agent is usually better than a sidecar in every Pod.
          </div>
        `,
};
