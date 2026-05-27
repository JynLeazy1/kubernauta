export default {
  es: `
      <p>En la <a href="/course/kubernetes-for-beginners/pods/introduccion">introducción del capítulo</a> mencionamos que un Pod puede tener más de un contenedor. Pero no siempre conviene. Entender cuándo un Pod debe tener uno solo y cuándo tiene sentido meter dos o tres es una de las decisiones de diseño más importantes que vas a tomar trabajando con Kubernetes.</p>

      <h2>El caso común: un Pod, un contenedor</h2>

      <p>El 90% de los Pods que verás en producción tienen exactamente un contenedor. Y eso es correcto. Cada Pod empaqueta <em>una</em> aplicación, y la aplicación es <em>un</em> contenedor. Si necesitas escalar, creas más réplicas del Pod con un Deployment. Si necesitas mover la carga a otro nodo, otro Pod arranca en otro lado.</p>

      <p>Esta regla también se lee en reversa: <strong>cuando tengas dudas, un Pod = un contenedor</strong>. Meter contenedores no relacionados en el mismo Pod te ata a decisiones de co-scheduling que vas a lamentar después (si uno de los contenedores necesita más CPU, el Pod entero necesita más CPU; si uno falla, puede afectar al otro; si uno debe reiniciarse, el otro también lo hará).</p>

      <h2>Cuándo sí tiene sentido multi-contenedor</h2>

      <p>Hay una pregunta que casi siempre decide correctamente: <em>¿estos contenedores necesitan correr en el mismo host, compartir red y/o archivos, y vivir y morir juntos?</em></p>

      <p>Si la respuesta a las tres es <em>sí</em>, el Pod es el lugar correcto. Si a alguna es <em>no</em>, son dos Pods.</p>

      <p>Ejemplos donde multi-contenedor es la solución idiomática:</p>

      <ul>
        <li><strong>Agente de logs</strong> (fluent-bit, promtail) corriendo junto a una aplicación que escribe archivos de log. El agente lee del mismo volumen <code>emptyDir</code> que la app escribe. No tiene sentido como Pod separado — no podría ver los archivos.</li>
        <li><strong>Proxy local</strong> (Envoy, nginx) delante de un backend. La app habla por <code>localhost</code> con el proxy, y el proxy expone la interfaz "pública" al Service. Service mesh como Istio se apoya exactamente en este patrón.</li>
        <li><strong>Init de estado</strong>: un contenedor que prepara archivos/configs antes de que arranque la app. Aquí se usan <em>init containers</em> (lo vemos en la siguiente sub-parte).</li>
        <li><strong>Reloader</strong>: un contenedor que observa un Secret/ConfigMap y escribe los cambios a un volumen, para que la app pueda recargar sin reiniciar.</li>
      </ul>

      <h2>Cómo se comunican los contenedores de un Pod</h2>

      <p>Como comparten namespaces, tienen tres canales naturales:</p>

      <ul>
        <li><strong>Red (localhost)</strong>: comparten la misma IP y espacio de puertos. El contenedor A puede abrir un servidor en <code>:8080</code> y el contenedor B le hace <code>curl localhost:8080</code> sin más. Ojo: no dos contenedores pueden escuchar el mismo puerto.</li>
        <li><strong>Volúmenes compartidos</strong>: un volumen declarado en <code>spec.volumes</code> puede montarse en dos contenedores simultáneamente. Útil para pasarse archivos sin red.</li>
        <li><strong>IPC</strong> (si se habilita <code>shareProcessNamespace</code>): señales, semaphores, shared memory. Menos común.</li>
      </ul>

      <p>Lo que <strong>no</strong> comparten por default es el namespace de PID — cada contenedor ve sus propios procesos y no los del vecino. Se puede cambiar con <code>spec.shareProcessNamespace: true</code>.</p>

      <h2>Ejemplo: app + sidecar de logs con volumen compartido</h2>

      <pre><code>apiVersion: v1
kind: Pod
metadata:
  name: web-with-log-shipper
spec:
  containers:
    - name: web
      image: myapp:1.0
      volumeMounts:
        - name: logs
          mountPath: /var/log/app
    - name: log-shipper
      image: fluent-bit:3.0
      args: ["--tail", "/var/log/app/*.log"]
      volumeMounts:
        - name: logs
          mountPath: /var/log/app
          readOnly: true
  volumes:
    - name: logs
      emptyDir: {}</code></pre>

      <p>Observa cómo los dos contenedores montan el mismo <code>emptyDir</code>. <code>web</code> lo escribe, <code>log-shipper</code> lo lee. Ambos viven y mueren con el Pod.</p>

      <h2>Anti-patrones que hay que evitar</h2>

      <p>Algunos errores comunes cuando alguien abusa del multi-contenedor:</p>

      <ul>
        <li><strong>Meter dos apps que solo hablan HTTP entre sí</strong>: si pueden comunicarse por red, deberían ser dos Pods con un Service. Forzarlas al mismo Pod las ata innecesariamente.</li>
        <li><strong>Usar un Pod como "mini host"</strong>: cinco contenedores con propósitos distintos (frontend, backend, DB, cache, worker). Eso no es un Pod, es una VM mal disimulada. Un Deployment por componente.</li>
        <li><strong>Compartir una DB embebida</strong>: no. La DB va en su propio Pod (idealmente en un StatefulSet). Meter SQLite al lado de tu app es un hack que vas a pagar con datos perdidos.</li>
      </ul>

      <h2>La regla práctica</h2>

      <p>Si puedes describir los dos contenedores como <em>"este es mi app, y este es un proceso auxiliar que solo existe para servirle al primero"</em>, vas bien. Si tienes que explicar relaciones complicadas entre los contenedores, probablemente sean dos Pods diferentes.</p>

      <p>En la siguiente sub-parte vemos los tres patrones clásicos de multi-contenedor con nombre y apellido: <em>init container</em>, <em>sidecar</em> y <em>ambassador</em>.</p>
    `,
  en: `
      <p>In the <a href="/course/kubernetes-for-beginners/pods/introduccion">chapter intro</a> we mentioned a Pod can have more than one container. But it isn't always the right move. Knowing when a Pod should have just one and when it makes sense to stuff in two or three is one of the most important design decisions you'll make working with Kubernetes.</p>

      <h2>The common case: one Pod, one container</h2>

      <p>90% of the Pods you'll see in production have exactly one container. That's correct. Each Pod packages <em>one</em> application, and the application is <em>one</em> container. If you need to scale, you create more Pod replicas with a Deployment. If you need to move load to another node, another Pod starts somewhere else.</p>

      <p>This rule reads in reverse too: <strong>when in doubt, one Pod = one container</strong>. Throwing unrelated containers into the same Pod ties you to co-scheduling decisions you'll regret later (if one container needs more CPU, the whole Pod needs more CPU; if one fails, it can drag the other; if one must restart, so does the other).</p>

      <h2>When multi-container does make sense</h2>

      <p>One question almost always decides correctly: <em>do these containers need to run on the same host, share network and/or files, and live and die together?</em></p>

      <p>If all three answers are <em>yes</em>, the Pod is the right place. If any is <em>no</em>, they're two Pods.</p>

      <p>Examples where multi-container is the idiomatic solution:</p>

      <ul>
        <li><strong>Log shipper</strong> (fluent-bit, promtail) running next to an application that writes log files. The agent reads the same <code>emptyDir</code> volume the app writes to. A separate Pod wouldn't work — it couldn't see the files.</li>
        <li><strong>Local proxy</strong> (Envoy, nginx) in front of a backend. The app talks to the proxy over <code>localhost</code>, and the proxy exposes the "public" interface to the Service. Service meshes like Istio are built exactly on this pattern.</li>
        <li><strong>State init</strong>: a container that prepares files/config before the app starts. For this you use <em>init containers</em> (next sub-part).</li>
        <li><strong>Reloader</strong>: a container that watches a Secret/ConfigMap and writes changes to a volume so the app can hot-reload without restarting.</li>
      </ul>

      <h2>How containers in a Pod talk to each other</h2>

      <p>Because they share namespaces, they have three natural channels:</p>

      <ul>
        <li><strong>Network (localhost)</strong>: they share the same IP and port space. Container A can open a server on <code>:8080</code> and container B can <code>curl localhost:8080</code> and it works. Caveat: two containers can't listen on the same port.</li>
        <li><strong>Shared volumes</strong>: a volume declared in <code>spec.volumes</code> can be mounted in two containers at once. Useful for passing files without networking.</li>
        <li><strong>IPC</strong> (if <code>shareProcessNamespace</code> is enabled): signals, semaphores, shared memory. Less common.</li>
      </ul>

      <p>What they do <strong>not</strong> share by default is the PID namespace — each container sees its own processes, not the neighbors'. You can change that with <code>spec.shareProcessNamespace: true</code>.</p>

      <h2>Example: app + log sidecar with a shared volume</h2>

      <pre><code>apiVersion: v1
kind: Pod
metadata:
  name: web-with-log-shipper
spec:
  containers:
    - name: web
      image: myapp:1.0
      volumeMounts:
        - name: logs
          mountPath: /var/log/app
    - name: log-shipper
      image: fluent-bit:3.0
      args: ["--tail", "/var/log/app/*.log"]
      volumeMounts:
        - name: logs
          mountPath: /var/log/app
          readOnly: true
  volumes:
    - name: logs
      emptyDir: {}</code></pre>

      <p>Notice how both containers mount the same <code>emptyDir</code>. <code>web</code> writes it, <code>log-shipper</code> reads it. Both live and die with the Pod.</p>

      <h2>Anti-patterns to avoid</h2>

      <p>Common mistakes when someone overuses multi-container:</p>

      <ul>
        <li><strong>Putting two apps that only speak HTTP to each other in the same Pod</strong>: if they can communicate over the network, they should be two Pods behind a Service. Forcing them into the same Pod couples them unnecessarily.</li>
        <li><strong>Using a Pod as a "mini host"</strong>: five containers with different purposes (frontend, backend, DB, cache, worker). That's not a Pod, that's a poorly disguised VM. One Deployment per component.</li>
        <li><strong>Sharing an embedded DB</strong>: don't. The DB goes in its own Pod (ideally in a StatefulSet). Dropping SQLite next to your app is a hack you'll pay for with lost data.</li>
      </ul>

      <h2>The practical rule</h2>

      <p>If you can describe the two containers as <em>"this is my app, and this one is a helper process that only exists to serve the first"</em>, you're on the right track. If you have to explain complex relationships between the containers, they're probably two different Pods.</p>

      <p>In the next sub-part we see the three classic multi-container patterns by name: <em>init container</em>, <em>sidecar</em>, and <em>ambassador</em>.</p>
    `,
};
