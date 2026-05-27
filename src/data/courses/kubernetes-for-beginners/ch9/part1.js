export default {
  es: `
      <h2>El problema de las IPs efímeras</h2>
      <p>Cuando un Pod muere y se recrea, obtiene una nueva IP. Los <strong>Services</strong> resuelven esto con una IP virtual estable que enruta al conjunto de Pods correctos usando <em>selectors</em>.</p>

      <h2>ClusterIP (por defecto)</h2>
      <p>Expone el Service en una IP interna del clúster. Solo accesible desde dentro del clúster.</p>
      <pre><code>apiVersion: v1
kind: Service
metadata:
  name: mi-servicio
spec:
  selector:
    app: mi-app
  ports:
    - port: 80
      targetPort: 8080
  type: ClusterIP</code></pre>

      <h2>NodePort</h2>
      <p>Expone el Service en un puerto estático de cada nodo (30000–32767). Útil para desarrollo, no recomendado para producción.</p>
      <pre><code>spec:
  type: NodePort
  ports:
    - port: 80
      targetPort: 8080
      nodePort: 30080</code></pre>

      <h2>LoadBalancer</h2>
      <p>Aprovisiona un balanceador de carga externo en proveedores de nube. Método estándar para exponer servicios en producción.</p>
      <pre><code>spec:
  type: LoadBalancer
  ports:
    - port: 80
      targetPort: 8080</code></pre>

      <h2>¿Y el Ingress?</h2>
      <p>Para exponer múltiples servicios HTTP/HTTPS bajo un mismo IP/dominio usando rutas, usa un <strong>Ingress</strong> con un Ingress Controller (nginx, Traefik, etc.).</p>
    `,
  en: `
      <h2>The ephemeral IP problem</h2>
      <p>When a Pod dies and is recreated, it gets a new IP. <strong>Services</strong> solve this with a stable virtual IP that routes to the correct set of Pods using <em>selectors</em>.</p>

      <h2>ClusterIP (default)</h2>
      <p>Exposes the Service on an internal cluster IP. Only accessible from within the cluster. Ideal for microservice-to-microservice communication.</p>
      <pre><code>apiVersion: v1
kind: Service
metadata:
  name: my-service
spec:
  selector:
    app: my-app
  ports:
    - port: 80
      targetPort: 8080
  type: ClusterIP</code></pre>

      <h2>NodePort</h2>
      <p>Exposes the Service on a static port on each node (30000–32767). Accessible from outside the cluster via <code>NodeIP:NodePort</code>. Useful for development, not recommended for production.</p>
      <pre><code>spec:
  type: NodePort
  ports:
    - port: 80
      targetPort: 8080
      nodePort: 30080</code></pre>

      <h2>LoadBalancer</h2>
      <p>Provisions an external load balancer on cloud providers (AWS ELB, GCP LB, Azure LB). The standard method for exposing services in production.</p>
      <pre><code>spec:
  type: LoadBalancer
  ports:
    - port: 80
      targetPort: 8080</code></pre>

      <h2>What about Ingress?</h2>
      <p>To expose multiple HTTP/HTTPS services under the same IP/domain using routes, use an <strong>Ingress</strong> with an Ingress Controller (nginx, Traefik, etc.). More efficient than one LoadBalancer per service.</p>
    `,
};
