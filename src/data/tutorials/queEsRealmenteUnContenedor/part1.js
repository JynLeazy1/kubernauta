export default {
  es: `
          <p>Si le preguntas a alguien qué es un contenedor, probablemente diga algo como "una VM liviana" o "un proceso aislado". Ninguna de las dos respuestas es del todo correcta.</p>

          <p>Un contenedor es un <strong>proceso ordinario de Linux</strong> al que el kernel le aplica un conjunto de mecanismos de aislamiento y control. No hay hypervisor, no hay kernel propio, no hay hardware virtualizado. El contenedor comparte el kernel del host — lo que cambia es <em>cómo ese proceso percibe el sistema que lo rodea</em>.</p>

          <p>Esta serie desmonta esa ilusión pieza por pieza, con comandos reales que puedes ejecutar en cualquier Linux moderno.</p>

          <h2>Qué cubriremos</h2>

          <ol>
            <li><strong>Linux Namespaces</strong> — la ilusión de estar solo: PID, red, filesystem, hostname y más.</li>
            <li><strong>Linux Capabilities</strong> — por qué "root dentro de un contenedor" no es el mismo root del host.</li>
            <li><strong>chroot y pivot_root</strong> — cómo cambiar la raíz del filesystem y por qué <code>pivot_root</code> es más seguro que <code>chroot</code>.</li>
            <li><strong>OverlayFS</strong> — el filesystem de capas que hace posible las imágenes Docker.</li>
            <li><strong>cgroups v1 y v2</strong> — control real de CPU, memoria e I/O.</li>
            <li><strong>Construyendo un contenedor desde 0</strong> — juntamos todo con <code>unshare</code>, <code>pivot_root</code> y un rootfs real.</li>
            <li><strong>Lo que hace el container runtime</strong> — qué hace <code>runc</code> exactamente cuando ejecutas <code>docker run</code>.</li>
            <li><strong>Resumen de la serie</strong> — el mapa completo y próximos pasos.</li>
          </ol>

          <h2>Prerrequisitos</h2>

          <p>Para seguir los ejemplos necesitas:</p>
          <ul>
            <li>Un Linux moderno con kernel ≥ 5.10 (Ubuntu 22.04+, Debian 12+, Fedora 37+)</li>
            <li><code>docker</code> instalado (para los ejemplos comparativos)</li>
            <li>Acceso a <code>sudo</code></li>
            <li>Las herramientas: <code>util-linux</code> (<code>unshare</code>, <code>lsns</code>), <code>iproute2</code>, <code>libcap2-bin</code> (<code>capsh</code>)</li>
          </ul>

          <pre><code># Ubuntu/Debian
sudo apt install util-linux iproute2 libcap2-bin</code></pre>

          <h2>La pregunta central</h2>

          <p>Al final de esta serie deberías poder responder: <em>¿puedo crear un "contenedor" con comandos del kernel sin Docker?</em></p>

          <p>La respuesta es sí. Y hacerlo te enseña más sobre contenedores que años de usar <code>docker run</code>.</p>
        `,
  en: `
          <p>Ask someone what a container is, and they'll probably say something like "a lightweight VM" or "an isolated process." Neither answer is entirely correct.</p>

          <p>A container is an <strong>ordinary Linux process</strong> to which the kernel applies a set of isolation and control mechanisms. There is no hypervisor, no separate kernel, no virtualized hardware. The container shares the host kernel — what changes is <em>how that process perceives the system around it</em>.</p>

          <p>This series dismantles that illusion piece by piece, using real commands you can run on any modern Linux system.</p>

          <h2>What we'll cover</h2>

          <ol>
            <li><strong>Linux Namespaces</strong> — the illusion of being alone: PID, network, filesystem, hostname, and more.</li>
            <li><strong>Linux Capabilities</strong> — why "root inside a container" is not the same as root on the host.</li>
            <li><strong>chroot and pivot_root</strong> — how to change the filesystem root and why <code>pivot_root</code> is safer than <code>chroot</code>.</li>
            <li><strong>OverlayFS</strong> — the layered filesystem that makes Docker images possible.</li>
            <li><strong>cgroups v1 and v2</strong> — real control over CPU, memory, and I/O.</li>
            <li><strong>Building a container from scratch</strong> — assembling everything with <code>unshare</code>, <code>pivot_root</code>, and a real rootfs.</li>
            <li><strong>What the container runtime does</strong> — exactly what <code>runc</code> does when you run <code>docker run</code>.</li>
            <li><strong>Series summary</strong> — the complete map and next steps.</li>
          </ol>

          <h2>Prerequisites</h2>

          <p>To follow the examples you need:</p>
          <ul>
            <li>A modern Linux system with kernel ≥ 5.10 (Ubuntu 22.04+, Debian 12+, Fedora 37+)</li>
            <li><code>docker</code> installed (for the comparative examples)</li>
            <li>Access to <code>sudo</code></li>
            <li>The tools: <code>util-linux</code> (<code>unshare</code>, <code>lsns</code>), <code>iproute2</code>, <code>libcap2-bin</code> (<code>capsh</code>)</li>
          </ul>

          <pre><code># Ubuntu/Debian
sudo apt install util-linux iproute2 libcap2-bin</code></pre>

          <h2>The central question</h2>

          <p>By the end of this series you should be able to answer: <em>can I create a "container" using kernel commands without Docker?</em></p>

          <p>The answer is yes. And doing it will teach you more about containers than years of running <code>docker run</code>.</p>
        `,
};
