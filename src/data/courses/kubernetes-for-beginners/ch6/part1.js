export default {
  es: `
      <h2>¿Qué es un Namespace?</h2>
      <p>Un <strong>Namespace</strong> es un mecanismo de aislamiento lógico dentro de un clúster. Los recursos dentro de un namespace tienen nombres únicos entre sí, pero pueden repetirse en distintos namespaces.</p>

      <h2>Namespaces por defecto</h2>
      <ul>
        <li><strong>default</strong> — el namespace sin configurar.</li>
        <li><strong>kube-system</strong> — componentes del sistema (API server, scheduler, etc.).</li>
        <li><strong>kube-public</strong> — datos públicos legibles por todos.</li>
        <li><strong>kube-node-lease</strong> — heartbeats de nodos.</li>
      </ul>

      <h2>Crear y usar namespaces</h2>
      <pre><code>kubectl create namespace produccion
kubectl get pods -n produccion
kubectl apply -f mi-app.yaml -n produccion</code></pre>

      <h2>Resource Quotas</h2>
      <pre><code>apiVersion: v1
kind: ResourceQuota
metadata:
  name: cuota-equipo-a
  namespace: equipo-a
spec:
  hard:
    requests.cpu: "4"
    requests.memory: 8Gi
    limits.cpu: "8"
    limits.memory: 16Gi
    pods: "20"</code></pre>

      <h2>LimitRange</h2>
      <pre><code>apiVersion: v1
kind: LimitRange
metadata:
  name: defaults
  namespace: equipo-a
spec:
  limits:
    - type: Container
      defaultRequest:
        cpu: 100m
        memory: 128Mi
      default:
        cpu: 500m
        memory: 512Mi</code></pre>

      <h2>Cuándo NO usar namespaces</h2>
      <p>Los namespaces aíslan lógicamente, no físicamente. Para aislamiento fuerte entre clientes considera clústeres separados o soluciones como vCluster.</p>
    `,
  en: `
      <h2>What is a Namespace?</h2>
      <p>A <strong>Namespace</strong> is a mechanism for logical isolation within a cluster. Resources inside a namespace have unique names among themselves, but the same name can exist in different namespaces.</p>

      <h2>Default namespaces</h2>
      <ul>
        <li><strong>default</strong> — the unconfigured default namespace.</li>
        <li><strong>kube-system</strong> — system components (API server, scheduler, etc.).</li>
        <li><strong>kube-public</strong> — publicly readable data.</li>
        <li><strong>kube-node-lease</strong> — node heartbeats.</li>
      </ul>

      <h2>Creating and using namespaces</h2>
      <pre><code>kubectl create namespace production
kubectl get pods -n production
kubectl apply -f my-app.yaml -n production</code></pre>

      <h2>Resource Quotas</h2>
      <pre><code>apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-a-quota
  namespace: team-a
spec:
  hard:
    requests.cpu: "4"
    requests.memory: 8Gi
    limits.cpu: "8"
    limits.memory: 16Gi
    pods: "20"</code></pre>

      <h2>LimitRange</h2>
      <pre><code>apiVersion: v1
kind: LimitRange
metadata:
  name: defaults
  namespace: team-a
spec:
  limits:
    - type: Container
      defaultRequest:
        cpu: 100m
        memory: 128Mi
      default:
        cpu: 500m
        memory: 512Mi</code></pre>

      <h2>When NOT to use namespaces</h2>
      <p>Namespaces provide logical isolation, not physical. For strong isolation between tenants, consider separate clusters or solutions like vCluster.</p>
    `,
};
