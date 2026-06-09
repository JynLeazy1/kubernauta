export default {
  es: `
      <p>Hasta ahora hemos hablado del control plane como si viviera en una sola máquina. Para aprender, está bien: es más fácil imaginar un servidor con los cuatro procesos corriendo, etcd al lado, y los workers conectándose. Pero en producción nadie corre Kubernetes así. Y cuando entiendas por qué, vas a ver también por qué la arquitectura reactiva de la que hablamos en la <a href="/course/kubernetes-for-beginners/architecture/flujo-de-una-peticion">sub-parte anterior</a> no es un detalle de diseño — es lo que hace posible la alta disponibilidad.</p>

      <h2>Single control plane: el problema</h2>

      <p>Imagina un cluster con un solo servidor de control plane. Un reinicio, una falla de disco, un cable mal conectado, y el cluster queda ciego:</p>

      <ul>
        <li>Ningún <code>kubectl</code> funciona.</li>
        <li>Los controllers no reconcilian nada.</li>
        <li>Si un Pod muere, nadie lo vuelve a crear.</li>
        <li>Si un nodo se cae, nadie redistribuye sus Pods.</li>
      </ul>

      <p>Las cargas que ya están corriendo sobreviven un rato — kubelet es autónomo mientras sus Pods sigan vivos — pero el cluster deja de auto-regularse. Para algo que vende la promesa de <em>"self-healing"</em>, tener un control plane mortal es contradictorio.</p>

      <h2>La solución: control plane replicado</h2>

      <p>En producción, el control plane se despliega en <strong>múltiples nodos</strong> — típicamente 3 o 5 — y cada componente se replica con estrategias distintas según su naturaleza.</p>

      <h3>apiserver: stateless, detrás de un load balancer</h3>

      <p>El <code>kube-apiserver</code> es, por diseño, <strong>sin estado</strong>. Todo lo que sabe lo guarda en etcd. Eso significa que puedes correr varias réplicas en paralelo: todas atienden peticiones, todas leen y escriben de etcd.</p>

      <p>Delante se pone un <strong>load balancer</strong> (HAProxy, un LB del cloud, keepalived+VIP, lo que sea) que reparte las peticiones. Si una réplica se cae, el LB saca su IP del pool y las demás absorben el tráfico. <code>kubectl</code> y los demás componentes siguen funcionando como si nada.</p>

      <h3>etcd: quórum distribuido</h3>

      <p>Como vimos en la <a href="/course/kubernetes-for-beginners/architecture/etcd-la-fuente-de-verdad">sub-parte anterior</a>, etcd corre típicamente en 3 o 5 nodos con Raft. La regla de la mayoría significa que:</p>

      <ul>
        <li>3 nodos → sobrevive a la caída de 1.</li>
        <li>5 nodos → sobrevive a la caída de 2.</li>
      </ul>

      <p>Si pierdes la mayoría, etcd entra en modo read-only y no acepta escrituras. El cluster no se destruye, pero no puedes cambiar nada hasta que recuperes quórum.</p>

      <h3>scheduler y controller-manager: leader election</h3>

      <p>El <code>kube-scheduler</code> y el <code>kube-controller-manager</code> son casos distintos: si dos réplicas del scheduler tomaran decisiones en paralelo, podrías asignar el mismo Pod a dos nodos distintos. Mal.</p>

      <p>La solución es <strong>leader election</strong>: varias réplicas corren en paralelo, pero solo una está "activa" en cada momento. Se coordinan usando un Lease (un objeto de Kubernetes diseñado exactamente para esto) guardado en etcd. El líder renueva su lease cada pocos segundos. Si deja de renovarlo — porque se cayó — otra réplica toma el relevo.</p>

      <p>El resultado: redundancia sin riesgo de doble decisión. Los otros procesos están <em>standby</em>, listos para tomar el mando.</p>

      <h3>cloud-controller-manager: igual que controller-manager</h3>

      <p>Cuando existe, usa el mismo patrón de leader election que el controller-manager.</p>

      <h2>Los worker nodes en este esquema</h2>

      <p>Los <code>worker nodes</code> ni se enteran de si el control plane es uno o cinco. Desde la óptica de <code>kubelet</code>, lo único que cambia es la URL del apiserver — apunta al LB en vez de a una IP fija.</p>

      <p>Y algo importante: <strong>los workers son resilientes a caídas del control plane</strong>. Mientras kubelet pueda llegar al apiserver (aunque sea intermitentemente), sigue haciendo su trabajo. Si el control plane entero desaparece por unos minutos, los Pods que ya corren siguen vivos. La "inteligencia" está distribuida.</p>

      <h2>Tres nodos, una topología típica</h2>

      <p>El setup más común en producción (fuera de los clusters gigantes) es <strong>3 nodos de control plane</strong> donde cada uno corre:</p>

      <ul>
        <li>Una réplica de <code>kube-apiserver</code>.</li>
        <li>Una instancia de <code>etcd</code> (miembro del cluster Raft).</li>
        <li>Una réplica de <code>kube-scheduler</code> (solo una es líder).</li>
        <li>Una réplica de <code>kube-controller-manager</code> (solo una es líder).</li>
      </ul>

      <p>Delante, un LB hacia los apiservers. Los workers apuntan al LB. Toleras la caída de 1 nodo de control plane sin interrupción visible.</p>

      <p>Herramientas como <a href="https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/" target="_blank" rel="noopener noreferrer">kubeadm</a> y los clusters gestionados (EKS, GKE, AKS) implementan exactamente este patrón por debajo. Cuando creas un cluster "administrado", el control plane HA es lo que el cloud provider te está dando hecho.</p>

      <h2>Qué necesitas saber para la KCNA</h2>

      <ul>
        <li>El control plane se replica en producción; nunca es una sola máquina.</li>
        <li>apiserver es stateless → se escala horizontalmente detrás de un LB.</li>
        <li>etcd requiere quórum (3 o 5 nodos).</li>
        <li>scheduler y controller-manager usan <em>leader election</em>.</li>
        <li>Los workers sobreviven a caídas del control plane; los Pods corriendo no se caen.</li>
      </ul>

      <p>En la siguiente sub-parte cerramos el capítulo con un resumen visual y te damos el mapa mental completo que vas a llevar al resto del curso.</p>
    `,
  en: `
      <p>So far we've talked about the control plane as if it lived on a single machine. For learning, that's fine: it's easier to picture one server with the four processes running, etcd alongside, and workers connecting in. But nobody runs Kubernetes like that in production. And when you understand why, you'll also see why the reactive architecture we discussed in the <a href="/course/kubernetes-for-beginners/architecture/flujo-de-una-peticion">previous sub-part</a> isn't a design detail — it's what makes high availability possible.</p>

      <h2>Single control plane: the problem</h2>

      <p>Picture a cluster with a single control plane server. A reboot, a disk failure, an unplugged cable, and the cluster goes blind:</p>

      <ul>
        <li>No <code>kubectl</code> works.</li>
        <li>Controllers reconcile nothing.</li>
        <li>If a Pod dies, nobody recreates it.</li>
        <li>If a node fails, nobody redistributes its Pods.</li>
      </ul>

      <p>Workloads already running survive for a while — kubelet is autonomous as long as its Pods stay up — but the cluster stops self-regulating. For something that sells a <em>"self-healing"</em> promise, having a mortal control plane is contradictory.</p>

      <h2>The fix: replicated control plane</h2>

      <p>In production, the control plane runs on <strong>multiple nodes</strong> — typically 3 or 5 — and each component is replicated using different strategies depending on its nature.</p>

      <h3>apiserver: stateless, behind a load balancer</h3>

      <p>The <code>kube-apiserver</code> is, by design, <strong>stateless</strong>. Everything it knows, it stores in etcd. That means you can run several replicas in parallel: they all serve requests, they all read and write to etcd.</p>

      <p>In front, you put a <strong>load balancer</strong> (HAProxy, a cloud LB, keepalived+VIP, whatever) that spreads the requests. If one replica goes down, the LB drops its IP from the pool and the others absorb the traffic. <code>kubectl</code> and the other components keep working as if nothing happened.</p>

      <h3>etcd: distributed quorum</h3>

      <p>As we saw in the <a href="/course/kubernetes-for-beginners/architecture/etcd-la-fuente-de-verdad">previous sub-part</a>, etcd typically runs on 3 or 5 nodes with Raft. The majority rule means:</p>

      <ul>
        <li>3 nodes → survives 1 down.</li>
        <li>5 nodes → survives 2 down.</li>
      </ul>

      <p>If you lose majority, etcd goes read-only and stops accepting writes. The cluster doesn't self-destruct, but you can't change anything until quorum is restored.</p>

      <h3>scheduler and controller-manager: leader election</h3>

      <p>The <code>kube-scheduler</code> and <code>kube-controller-manager</code> are different cases: if two scheduler replicas made decisions in parallel, you could assign the same Pod to two different nodes. Bad.</p>

      <p>The solution is <strong>leader election</strong>: several replicas run in parallel, but only one is "active" at a time. They coordinate using a Lease (a Kubernetes object designed exactly for this) stored in etcd. The leader renews its lease every few seconds. If it stops renewing — because it crashed — another replica takes over.</p>

      <p>The result: redundancy without the risk of double decisions. The other processes are <em>standby</em>, ready to step in.</p>

      <h3>cloud-controller-manager: same as controller-manager</h3>

      <p>When present, it uses the same leader election pattern as the controller-manager.</p>

      <h2>Worker nodes in this picture</h2>

      <p>The <code>worker nodes</code> don't even notice whether the control plane is one machine or five. From <code>kubelet</code>'s point of view, the only thing that changes is the apiserver URL — it points at the LB instead of a fixed IP.</p>

      <p>And importantly: <strong>workers are resilient to control plane outages</strong>. As long as kubelet can reach the apiserver (even intermittently), it keeps doing its job. If the whole control plane disappears for a few minutes, the Pods already running stay alive. Intelligence is distributed.</p>

      <h2>Three nodes, a typical topology</h2>

      <p>The most common production setup (outside of giant clusters) is <strong>3 control plane nodes</strong>, each running:</p>

      <ul>
        <li>One replica of <code>kube-apiserver</code>.</li>
        <li>One instance of <code>etcd</code> (member of the Raft cluster).</li>
        <li>One replica of <code>kube-scheduler</code> (only one is leader).</li>
        <li>One replica of <code>kube-controller-manager</code> (only one is leader).</li>
      </ul>

      <p>In front, an LB to the apiservers. Workers point to the LB. You tolerate the loss of 1 control plane node with no visible disruption.</p>

      <p>Tools like <a href="https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/" target="_blank" rel="noopener noreferrer">kubeadm</a> and managed clusters (EKS, GKE, AKS) implement exactly this pattern under the hood. When you create a "managed" cluster, the HA control plane is what the cloud provider is giving you ready-made.</p>

      <h2>What you need to know for the KCNA</h2>

      <ul>
        <li>The control plane is replicated in production; it is never a single machine.</li>
        <li>apiserver is stateless → scales horizontally behind an LB.</li>
        <li>etcd requires quorum (3 or 5 nodes).</li>
        <li>scheduler and controller-manager use <em>leader election</em>.</li>
        <li>Workers survive control plane outages; running Pods don't fall.</li>
      </ul>

      <p>In the next sub-part we close the chapter with a visual recap and the full mental map you'll carry into the rest of the course.</p>
    `,
}
