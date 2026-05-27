const post = {
  id: 7,
  slug: "activar-ipvs-en-kube-proxy",
  title: {
    es: "Cómo activar el modo IPVS en kube-proxy",
    en: "How to Enable IPVS Mode in kube-proxy",
  },
  date: "2026-02-12",
  author: "Kubernauta",
  excerpt: {
    es: "El modo iptables evalúa reglas secuencialmente — con miles de Services, eso escala mal. IPVS usa tablas hash O(1). Este post muestra cómo cambiar el modo en un cluster existente sin downtime.",
    en: "iptables mode evaluates rules sequentially — with thousands of Services, that scales poorly. IPVS uses O(1) hash tables. This post shows how to switch modes in a running cluster without downtime.",
  },
  tags: ["kube-proxy", "ipvs", "networking", "performance"],
  content: {
    es: `
      <div class="callout callout-warning">
        <span class="callout-label">Deprecado</span>
        <p>IPVS fue deprecado en Kubernetes 1.35 y puede ser removido en una versión futura. Para instalaciones nuevas, el modo recomendado es <strong>nftables</strong> (GA desde 1.33, requiere Linux 5.13+). Este post documenta el proceso de activación para clusters existentes que necesiten migrar gradualmente.</p>
      </div>

      <h2>Por qué considerar IPVS</h2>
      <p>En el modo iptables, cada paquete recorre las reglas de la chain <code>KUBE-SERVICES</code> linealmente hasta encontrar la que coincide. Con diez Services eso es trivial. Con diez mil, cada conexión nueva evalúa miles de reglas antes de llegar al DNAT correcto. IPVS (IP Virtual Server) es un módulo del kernel diseñado específicamente para load balancing: usa una tabla hash donde la búsqueda es O(1) independientemente de cuántos Services existan.</p>

      <h2>Prerequisitos: módulos del kernel</h2>
      <p>IPVS requiere cuatro módulos del kernel. Verifica que estén cargados en todos los nodos antes de cambiar la configuración:</p>
      <pre><code>lsmod | grep -E "^ip_vs"
# ip_vs_sh               12288  0
# ip_vs_wrr              12288  0
# ip_vs_rr               12288  0
# ip_vs                 221184  6 ip_vs_rr,ip_vs_sh,ip_vs_wrr</code></pre>

      <p>Si no están cargados, hay que cargar cada módulo por separado — <code>modprobe</code> no garantiza cargar múltiples módulos en un solo comando (créeme, lo intenté):</p>
      <pre><code>sudo modprobe ip_vs
sudo modprobe ip_vs_rr
sudo modprobe ip_vs_wrr
sudo modprobe ip_vs_sh

lsmod | grep -E "^ip_vs"
# ip_vs_sh               12288  0
# ip_vs_wrr              12288  0
# ip_vs_rr               12288  0
# ip_vs                 221184  6 ip_vs_rr,ip_vs_sh,ip_vs_wrr

# Persistir entre reinicios
sudo cat >> /etc/modules-load.d/ipvs.conf << EOF
ip_vs
ip_vs_rr
ip_vs_wrr
ip_vs_sh
EOF</code></pre>

      <p>También necesitas el módulo <code>nf_conntrack</code>, que suele estar cargado por defecto, y el binario <code>ipvsadm</code> para inspección:</p>
      <pre><code>sudo apt-get install -y ipvsadm</code></pre>

      <h2>Editar el ConfigMap de kube-proxy</h2>
      <p>El modo se configura en el campo <code>mode</code> del ConfigMap <code>kube-proxy</code> en el namespace <code>kube-system</code>. Editalo directamente:</p>
      <pre><code>kubectl edit configmap kube-proxy -n kube-system</code></pre>

      <p>Busca la sección <code>mode</code> y cámbiala de string vacío a <code>"ipvs"</code>. También activa <code>strictARP: true</code> en la sección <code>ipvs</code> — es necesario para que el tráfico no se filtre por ARP en nodos con múltiples interfaces:</p>
      <pre><code>    mode: "ipvs"
    ipvs:
      scheduler: ""
      strictARP: true
      syncPeriod: 0s</code></pre>

      <h2>Reiniciar los pods de kube-proxy</h2>
      <p>kube-proxy es un DaemonSet — no se recarga solo con el cambio del ConfigMap. Hay que eliminar los pods para que se recreen con la nueva configuración:</p>
      <pre><code>kubectl rollout restart daemonset kube-proxy -n kube-system
kubectl rollout status daemonset kube-proxy -n kube-system
# Waiting for daemon set "kube-proxy" rollout to finish: 0 out of 2 new pods have been updated...
# daemon set "kube-proxy" successfully rolled out</code></pre>

      <h2>Verificar el cambio</h2>
      <p>La confirmación definitiva es <code>ipvsadm -Ln</code> — si muestra virtual servers, IPVS está activo:</p>
      <pre><code>sudo ipvsadm -Ln
# IP Virtual Server version 1.2.1 (size=4096)
# Prot LocalAddress:Port Scheduler Flags
#   -> RemoteAddress:Port           Forward Weight ActiveConn InActConn
# TCP  10.96.0.1:443 rr
#   -> 172.30.1.2:6443              Masq    1      1          6
# TCP  10.96.0.10:53 rr
#   -> 192.168.1.2:53               Masq    1      0          0
#   -> 192.168.1.3:53               Masq    1      0          0
# TCP  10.96.0.10:9153 rr
#   -> 192.168.1.2:9153             Masq    1      0          0
#   -> 192.168.1.3:9153             Masq    1      0          0
# TCP  10.110.171.208:80 rr
#   -> 192.168.1.4:80               Masq    1      0          0
#   -> 192.168.1.5:80               Masq    1      0          0
#   -> 192.168.1.6:80               Masq    1      0          0
# UDP  10.96.0.10:53 rr
#   -> 192.168.1.2:53               Masq    1      0          0
#   -> 192.168.1.3:53               Masq    1      0          0</code></pre>

      <p>Cada Service aparece como un virtual server con su ClusterIP y puerto. Debajo, cada Pod backend aparece como un real server con su IP y el scheduler asignado — <code>rr</code> (round-robin) por defecto. El cluster de ejemplo tiene cuatro Services: el API server de Kubernetes en <code>10.96.0.1:443</code>, CoreDNS en <code>10.96.0.10</code> con entradas TCP y UDP para el puerto 53, el endpoint de métricas de CoreDNS en el 9153, y el Service de nginx en <code>10.110.171.208:80</code> con sus tres Pods backend. Puedes cambiar el scheduler a <code>lc</code> (least connections) o <code>sh</code> (source hash) editando el campo <code>scheduler</code> en el ConfigMap y haciendo otro rollout restart.</p>

      <h2>Revertir si algo falla</h2>
      <p>Si encuentras problemas, revertir es el proceso inverso: edita el ConfigMap, pones <code>mode: ""</code> de nuevo, y haces rollout restart del DaemonSet. Las reglas iptables se regeneran automáticamente y las entradas IPVS desaparecen.</p>
    `,
    en: `
      <div class="callout callout-warning">
        <span class="callout-label">Deprecated</span>
        <p>IPVS was deprecated in Kubernetes 1.35 and may be removed in a future release. For new installations, the recommended mode is <strong>nftables</strong> (GA since 1.33, requires Linux 5.13+). This post documents the enablement process for existing clusters that need to migrate gradually.</p>
      </div>

      <h2>Why consider IPVS</h2>
      <p>In iptables mode, each packet traverses the rules in the <code>KUBE-SERVICES</code> chain linearly until it finds the matching one. With ten Services that is trivial. With ten thousand, every new connection evaluates thousands of rules before reaching the right DNAT. IPVS (IP Virtual Server) is a kernel module designed specifically for load balancing: it uses a hash table where lookup is O(1) regardless of how many Services exist.</p>

      <h2>Prerequisites: kernel modules</h2>
      <p>IPVS requires four kernel modules. Verify they are loaded on every node before changing the configuration:</p>
      <pre><code>lsmod | grep -E "^ip_vs"
# ip_vs_sh               12288  0
# ip_vs_wrr              12288  0
# ip_vs_rr               12288  0
# ip_vs                 221184  6 ip_vs_rr,ip_vs_sh,ip_vs_wrr</code></pre>

      <p>If they are not loaded, each module must be loaded separately — <code>modprobe</code> does not guarantee loading multiple modules in a single call (trust me, I tried):</p>
      <pre><code>sudo modprobe ip_vs
sudo modprobe ip_vs_rr
sudo modprobe ip_vs_wrr
sudo modprobe ip_vs_sh

lsmod | grep -E "^ip_vs"
# ip_vs_sh               12288  0
# ip_vs_wrr              12288  0
# ip_vs_rr               12288  0
# ip_vs                 221184  6 ip_vs_rr,ip_vs_sh,ip_vs_wrr

# Persist across reboots
sudo cat >> /etc/modules-load.d/ipvs.conf << EOF
ip_vs
ip_vs_rr
ip_vs_wrr
ip_vs_sh
EOF</code></pre>

      <p>You also need the <code>nf_conntrack</code> module, which is usually loaded by default, and the <code>ipvsadm</code> binary for inspection:</p>
      <pre><code>sudo apt-get install -y ipvsadm</code></pre>

      <h2>Edit the kube-proxy ConfigMap</h2>
      <p>The mode is configured in the <code>mode</code> field of the <code>kube-proxy</code> ConfigMap in the <code>kube-system</code> namespace. Edit it directly:</p>
      <pre><code>kubectl edit configmap kube-proxy -n kube-system</code></pre>

      <p>Find the <code>mode</code> field and change it from an empty string to <code>"ipvs"</code>. Also enable <code>strictARP: true</code> in the <code>ipvs</code> section — this is required to prevent traffic from leaking through ARP on nodes with multiple interfaces:</p>
      <pre><code>    mode: "ipvs"
    ipvs:
      scheduler: ""
      strictARP: true
      syncPeriod: 0s</code></pre>

      <h2>Restart the kube-proxy pods</h2>
      <p>kube-proxy is a DaemonSet — it does not reload automatically on ConfigMap changes. You need to delete the pods so they are recreated with the new configuration:</p>
      <pre><code>kubectl rollout restart daemonset kube-proxy -n kube-system
kubectl rollout status daemonset kube-proxy -n kube-system
# Waiting for daemon set "kube-proxy" rollout to finish: 0 out of 2 new pods have been updated...
# daemon set "kube-proxy" successfully rolled out</code></pre>

      <h2>Verify the change</h2>
      <p>The definitive confirmation is <code>ipvsadm -Ln</code> — if it shows virtual servers, IPVS is active:</p>
      <pre><code>sudo ipvsadm -Ln
# IP Virtual Server version 1.2.1 (size=4096)
# Prot LocalAddress:Port Scheduler Flags
#   -> RemoteAddress:Port           Forward Weight ActiveConn InActConn
# TCP  10.96.0.1:443 rr
#   -> 172.30.1.2:6443              Masq    1      1          6
# TCP  10.96.0.10:53 rr
#   -> 192.168.1.2:53               Masq    1      0          0
#   -> 192.168.1.3:53               Masq    1      0          0
# TCP  10.96.0.10:9153 rr
#   -> 192.168.1.2:9153             Masq    1      0          0
#   -> 192.168.1.3:9153             Masq    1      0          0
# TCP  10.110.171.208:80 rr
#   -> 192.168.1.4:80               Masq    1      0          0
#   -> 192.168.1.5:80               Masq    1      0          0
#   -> 192.168.1.6:80               Masq    1      0          0
# UDP  10.96.0.10:53 rr
#   -> 192.168.1.2:53               Masq    1      0          0
#   -> 192.168.1.3:53               Masq    1      0          0</code></pre>

      <p>Each Service appears as a virtual server with its ClusterIP and port. Below it, each Pod backend appears as a real server with its IP and the assigned scheduler — <code>rr</code> (round-robin) by default. The example cluster has four Services: the Kubernetes API server at <code>10.96.0.1:443</code>, CoreDNS at <code>10.96.0.10</code> with TCP and UDP entries for port 53, the CoreDNS metrics endpoint on 9153, and the nginx Service at <code>10.110.171.208:80</code> with its three Pod backends. You can change the scheduler to <code>lc</code> (least connections) or <code>sh</code> (source hash) by editing the <code>scheduler</code> field in the ConfigMap and doing another rollout restart.</p>

      <h2>Reverting if something goes wrong</h2>
      <p>If you run into problems, reverting is the inverse process: edit the ConfigMap, set <code>mode: ""</code> again, and do a rollout restart of the DaemonSet. The iptables rules are automatically regenerated and the IPVS entries disappear.</p>
    `,
  },
};

export default post;
