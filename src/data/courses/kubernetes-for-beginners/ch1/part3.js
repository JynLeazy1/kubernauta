export default {
  es: `
      <p>Si el <code>control plane</code> es el cerebro, los <code>worker nodes</code> son los brazos. Es donde finalmente tus contenedores <em>corren</em> — no donde se deciden, donde se ejecutan. Y como dijimos al principio del capítulo, un <code>worker node</code> <strong>no es una máquina especial</strong>. Es un servidor Linux normal con tres procesos clave arriba.</p>

      <p>Esos tres procesos son:</p>

      <ul>
        <li><code>kubelet</code> — el agente de Kubernetes en el nodo.</li>
        <li>Un <strong>container runtime</strong> (containerd, CRI-O, …) — quien realmente corre contenedores.</li>
        <li><code>kube-proxy</code> — quien programa las reglas de red del nodo.</li>
      </ul>

      <p>Quítale cualquiera de los tres y el nodo deja de ser útil al cluster. Pero la máquina Linux debajo sigue siendo la misma.</p>

      <h2>kubelet: el agente</h2>

      <p>El <code>kubelet</code> es el proceso más importante en un worker. Su trabajo es <strong>asegurarse de que los Pods asignados a <em>este</em> nodo estén corriendo como el cluster espera</strong>. Un reconciliador, igual que los controllers del control plane, pero con un alcance local.</p>

      <p>Su loop, simplificado, es:</p>

      <ol>
        <li>Se registra con el apiserver al arrancar (<em>"hola, soy el nodo X, tengo estos recursos"</em>).</li>
        <li>Hace un <em>watch</em> al apiserver para ver qué Pods tienen <code>spec.nodeName = X</code>.</li>
        <li>Por cada Pod que debe correr aquí, le pide al container runtime que lo cree.</li>
        <li>Por cada Pod que ya no debe correr, le pide al runtime que lo termine.</li>
        <li>Cada ~10 segundos reporta al apiserver el estado de los Pods y del nodo mismo.</li>
      </ol>

      <p>El detalle importante: el <code>kubelet</code> no sabe ejecutar contenedores por sí mismo. No tiene lógica de <code>runc</code>, ni conocimiento del kernel. Lo que tiene es un cliente que habla <strong>CRI</strong> (Container Runtime Interface) con el runtime real. Lo profundizamos en el <a href="/course/kubernetes-for-beginners/container-runtimes-and-cri">capítulo 7</a>.</p>

      <p>Otro detalle — los probes (<em>liveness</em>, <em>readiness</em>, <em>startup</em>) los ejecuta <strong>el kubelet</strong>. Por eso los probes son locales al nodo: no son una llamada que hace el apiserver. Los hace kubelet desde el nodo donde vive el Pod.</p>

      <h2>Container runtime: quien realmente corre contenedores</h2>

      <p>El <em>runtime</em> es el programa que sabe cómo convertir una imagen OCI y un spec en un proceso Linux aislado con namespaces y cgroups. Hoy los dos más comunes son <strong>containerd</strong> y <strong>CRI-O</strong>. Ambos implementan la misma interfaz (CRI), así que a kubelet le da igual cuál tengas.</p>

      <p>Lo que el runtime hace, en esencia:</p>

      <ul>
        <li>Descargar la imagen del registry si no está en caché.</li>
        <li>Desempaquetarla en el filesystem local (vía OverlayFS, típicamente).</li>
        <li>Llamar a <code>runc</code> (o equivalente) para que cree los namespaces, cgroups y <code>chroot</code>, y ejecute el proceso.</li>
        <li>Exponer al kubelet métricas y logs del contenedor.</li>
      </ul>

      <p>Si te interesa ver estas piezas desde abajo, el <em><a href="/tutorial/que-es-realmente-un-contenedor">tutorial "¿Qué es realmente un contenedor?"</a></em> las abre pieza por pieza.</p>

      <h2>kube-proxy: el que hace que las Services funcionen</h2>

      <p>El tercer proceso es <code>kube-proxy</code>. Su trabajo suena humilde pero es crítico: <strong>programar reglas de red en el nodo para que los Services funcionen</strong>.</p>

      <p>Necesitamos adelantar un concepto del <a href="/course/kubernetes-for-beginners/services">capítulo 9</a>: en Kubernetes, una <strong>Service</strong> es una IP virtual estable que apunta a un conjunto de Pods. Cuando tu contenedor hace <code>curl http://my-service</code>, los paquetes llegan al stack de red del nodo con esa IP como destino. Alguien tiene que interceptar esos paquetes y redirigirlos a una IP real de Pod. Ese alguien es <code>kube-proxy</code> — o más bien, las reglas que programa (en <em>iptables</em>, <em>ipvs</em> o <em>nftables</em>, dependiendo del modo).</p>

      <p>Importante: <code>kube-proxy</code> no maneja tráfico, solo programa reglas. El kernel hace el trabajo real de decidir a qué Pod va cada paquete. Si <code>kube-proxy</code> muere, las reglas que ya programó siguen activas; pero cualquier Service nueva, cualquier cambio de endpoints, deja de reflejarse hasta que vuelva.</p>

      <p>Lo cubrimos en profundidad en el <a href="/course/kubernetes-for-beginners/services">capítulo 9 (Services)</a>. Por ahora quédate con la imagen: cada nodo tiene su propio <code>kube-proxy</code>, y cada <code>kube-proxy</code> mantiene sincronizadas sus reglas con las Services que declaraste en el cluster.</p>

      <h2>Cómo se integra todo</h2>

      <p>Con estos tres procesos más una máquina Linux, un nodo se convierte en un "nodo de Kubernetes". El cluster no sabe si es un servidor bare-metal, una VM en AWS o un Raspberry Pi — siempre que kubelet se pueda registrar con el apiserver, que haya un runtime compatible y que kube-proxy pueda programar reglas, el nodo participa.</p>

      <p>Esa es, por cierto, otra de las promesas de Kubernetes: <strong>heterogeneidad de hardware</strong>. Puedes tener un cluster con nodos de distintos tamaños y arquitecturas, y el scheduler se encarga del reparto.</p>

      <p>En el siguiente paso ponemos todas estas piezas a trabajar juntas: seguimos el viaje de una petición desde <code>kubectl apply</code> hasta un contenedor corriendo. Vas a ver exactamente qué proceso hace qué y en qué orden.</p>
    `,
  en: `
      <p>If the control plane is the brain, the worker nodes are the arms. It is where your containers finally <em>run</em> — not where they are decided, where they are executed. And as we said at the start of the chapter, a worker node <strong>is not a special machine</strong>. It is a regular Linux server with three key processes on top.</p>

      <p>Those three processes are:</p>

      <ul>
        <li><code>kubelet</code> — the Kubernetes agent on the node.</li>
        <li>A <strong>container runtime</strong> (containerd, CRI-O, …) — the one that actually runs containers.</li>
        <li><code>kube-proxy</code> — the one that programs the node's network rules.</li>
      </ul>

      <p>Take any of the three away and the node stops being useful to the cluster. But the Linux machine underneath is still the same.</p>

      <h2>kubelet: the agent</h2>

      <p>The <code>kubelet</code> is the most important process on a worker. Its job is to <strong>make sure the Pods assigned to <em>this</em> node are running the way the cluster expects</strong>. A reconciler, like the control plane controllers, but with local scope.</p>

      <p>Its loop, simplified, is:</p>

      <ol>
        <li>Register with the apiserver on startup (<em>"hi, I'm node X, I have these resources"</em>).</li>
        <li>Watch the apiserver for Pods whose <code>spec.nodeName = X</code>.</li>
        <li>For each Pod that should run here, ask the container runtime to create it.</li>
        <li>For each Pod that should no longer run, ask the runtime to terminate it.</li>
        <li>Every ~10 seconds report Pod and node status back to the apiserver.</li>
      </ol>

      <p>The important detail: <code>kubelet</code> does not know how to run containers on its own. It has no <code>runc</code> logic, no direct kernel knowledge. What it has is a client that speaks <strong>CRI</strong> (Container Runtime Interface) with the real runtime. We go deep on this in <a href="/course/kubernetes-for-beginners/container-runtimes-and-cri">chapter 7</a>.</p>

      <p>Another detail — probes (<em>liveness</em>, <em>readiness</em>, <em>startup</em>) are executed <strong>by kubelet</strong>. That's why probes are local to the node: they are not a call made by the apiserver. Kubelet runs them from the node where the Pod lives.</p>

      <h2>Container runtime: the one that actually runs containers</h2>

      <p>The <em>runtime</em> is the program that knows how to turn an OCI image and a spec into a Linux process isolated with namespaces and cgroups. Today the two most common are <strong>containerd</strong> and <strong>CRI-O</strong>. Both implement the same interface (CRI), so kubelet doesn't care which one you have.</p>

      <p>What the runtime does, in short:</p>

      <ul>
        <li>Pull the image from the registry if it is not cached.</li>
        <li>Unpack it on the local filesystem (typically via OverlayFS).</li>
        <li>Call <code>runc</code> (or equivalent) to create namespaces, cgroups and <code>chroot</code>, and execute the process.</li>
        <li>Expose metrics and logs of the container to kubelet.</li>
      </ul>

      <p>If you are curious about these pieces from the bottom up, the <em><a href="/tutorial/que-es-realmente-un-contenedor">"What a container really is"</a></em> tutorial opens them piece by piece.</p>

      <h2>kube-proxy: the one that makes Services work</h2>

      <p>The third process is <code>kube-proxy</code>. Its job sounds humble but it's critical: <strong>programming network rules on the node so that Services work</strong>.</p>

      <p>We need to pull a concept forward from <a href="/course/kubernetes-for-beginners/services">chapter 9</a>: in Kubernetes, a <strong>Service</strong> is a stable virtual IP that points to a set of Pods. When your container does <code>curl http://my-service</code>, packets arrive at the node's network stack with that IP as destination. Someone has to intercept those packets and redirect them to a real Pod IP. That someone is <code>kube-proxy</code> — or rather, the rules it programs (in <em>iptables</em>, <em>ipvs</em>, or <em>nftables</em>, depending on the mode).</p>

      <p>Important: <code>kube-proxy</code> does not handle traffic, it only programs rules. The kernel does the real work of deciding which Pod each packet goes to. If <code>kube-proxy</code> dies, the rules it already programmed keep working; but any new Service, any endpoint change, stops being reflected until it comes back.</p>

      <p>We cover this in depth in <a href="/course/kubernetes-for-beginners/services">chapter 9 (Services)</a>. For now, keep this picture: every node has its own <code>kube-proxy</code>, and every <code>kube-proxy</code> keeps its rules in sync with the Services you declared in the cluster.</p>

      <h2>How it all fits together</h2>

      <p>With these three processes plus a Linux machine, a node becomes a "Kubernetes node". The cluster does not know if it is a bare-metal server, a VM on AWS, or a Raspberry Pi — as long as kubelet can register with the apiserver, there is a compatible runtime, and kube-proxy can program rules, the node participates.</p>

      <p>That, by the way, is another of Kubernetes' promises: <strong>hardware heterogeneity</strong>. You can have a cluster with nodes of different sizes and architectures, and the scheduler handles the distribution.</p>

      <p>In the next step we put all these pieces to work together: we follow the journey of a request from <code>kubectl apply</code> to a running container. You'll see exactly which process does what and in what order.</p>
    `,
}
