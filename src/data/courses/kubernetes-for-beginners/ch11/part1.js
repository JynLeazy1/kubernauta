export default {
  es: `
      <h2>El problema del downtime al actualizar</h2>
      <p>Actualizar una aplicación en producción sin interrumpir a los usuarios requiere una estrategia cuidadosa. Kubernetes ofrece dos estrategias de Deployment integradas.</p>

      <h2>Recreate</h2>
      <p>Termina todos los Pods viejos antes de crear los nuevos. Simple pero produce downtime. Útil cuando no puedes correr dos versiones simultáneamente (esquema de BD incompatible, puerto único).</p>
      <pre><code>strategy:
  type: Recreate</code></pre>

      <h2>RollingUpdate (por defecto)</h2>
      <p>Reemplaza los Pods de forma incremental. Durante la transición coexisten Pods de la versión anterior y la nueva.</p>
      <pre><code>strategy:
  type: RollingUpdate
  rollingUpdate:
    maxUnavailable: 1
    maxSurge: 1</code></pre>

      <h2>Comandos esenciales</h2>
      <pre><code>kubectl set image deployment/mi-app app=mi-imagen:v2
kubectl rollout status deployment/mi-app
kubectl rollout undo deployment/mi-app
kubectl rollout history deployment/mi-app</code></pre>

      <h2>Readiness probes: la clave del zero-downtime</h2>
      <p>Un <strong>readiness probe</strong> indica a Kubernetes cuándo un Pod está listo para recibir tráfico. Sin él, el tráfico puede llegar a un Pod que aún está iniciando.</p>
      <pre><code>readinessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 10</code></pre>
    `,
  en: `
      <h2>The downtime problem when updating</h2>
      <p>Updating a production application without interrupting users requires a careful strategy. Kubernetes offers two built-in Deployment strategies.</p>

      <h2>Recreate</h2>
      <p>Terminates all old Pods before creating new ones. Simple but causes downtime. Useful when you can't run two versions simultaneously (incompatible DB schema, single port).</p>
      <pre><code>strategy:
  type: Recreate</code></pre>

      <h2>RollingUpdate (default)</h2>
      <p>Replaces Pods incrementally. During the transition, old and new version Pods coexist.</p>
      <pre><code>strategy:
  type: RollingUpdate
  rollingUpdate:
    maxUnavailable: 1
    maxSurge: 1</code></pre>

      <h2>Essential commands</h2>
      <pre><code>kubectl set image deployment/my-app app=my-image:v2
kubectl rollout status deployment/my-app
kubectl rollout undo deployment/my-app
kubectl rollout history deployment/my-app</code></pre>

      <h2>Readiness probes: the key to zero-downtime</h2>
      <p>A <strong>readiness probe</strong> tells Kubernetes when a Pod is ready to receive traffic. Without it, traffic can reach a Pod that's still starting up. Always define readiness probes in production applications.</p>
      <pre><code>readinessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 10</code></pre>
    `,
};
