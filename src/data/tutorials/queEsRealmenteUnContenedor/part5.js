export default {
  es: `
          <p>Una imagen de Docker no es un archivo monolítico. Es una pila de capas de solo lectura. Cuando arrancas un contenedor, el runtime añade una capa de lectura-escritura encima. Todo esto es <strong>OverlayFS</strong>, un filesystem de unión incluido en el kernel desde la versión 3.18.</p>

          <h2>Los cuatro directorios de OverlayFS</h2>

          <pre><code>lowerdir  → capas de solo lectura (la imagen)
upperdir  → capa de lectura-escritura (cambios del contenedor)
workdir   → directorio de trabajo interno (mismo filesystem que upper)
merged    → el punto de montaje que ve el proceso</code></pre>

          <h2>Montando un overlay a mano</h2>

          <pre><code>mkdir -p /tmp/overlay/{lower,upper,work,merged}

# Contenido base en la capa inferior
echo "archivo original" > /tmp/overlay/lower/archivo.txt
echo "solo en lower"   > /tmp/overlay/lower/lower-only.txt

# Montar el overlay
sudo mount -t overlay overlay \\
  -o lowerdir=/tmp/overlay/lower,\\
     upperdir=/tmp/overlay/upper,\\
     workdir=/tmp/overlay/work \\
  /tmp/overlay/merged</code></pre>

          <pre><code># Desde merged ves todo
cat /tmp/overlay/merged/archivo.txt     # "archivo original"
cat /tmp/overlay/merged/lower-only.txt  # "solo en lower"

# Modificas un archivo
echo "modificado" > /tmp/overlay/merged/archivo.txt

# El original en lower NO cambió
cat /tmp/overlay/lower/archivo.txt   # "archivo original"

# La copia modificada está en upper (copy-on-write)
cat /tmp/overlay/upper/archivo.txt   # "modificado"</code></pre>

          <h2>Copy-on-write (CoW)</h2>

          <p>El archivo original nunca se toca. En la primera escritura, el kernel copia el <strong>archivo entero</strong> desde la capa inferior al <code>upperdir</code> (esto se llama <em>copy-up</em>) y aplica el cambio sobre esa copia. La capa inferior permanece inmutable — lo que permite que múltiples contenedores compartan las mismas capas de imagen sin interferirse.</p>

          <p>Es importante entender que el copy-up es a nivel de <strong>archivo completo</strong>, no de bloque: escribir 1 byte a un archivo de 1 GB dispara la copia de 1 GB al <code>upperdir</code>. Por eso los contenedores con bases de datos o logs voluminosos se benefician de volúmenes (<code>-v</code>) en vez de escribir sobre la capa de overlay.</p>

          <p>Referencias oficiales:</p>
          <ul>
            <li><a href="https://docs.kernel.org/filesystems/overlayfs.html#non-directories" target="_blank" rel="noopener">Documentación del kernel de Linux — <em>overlayfs — Non-directories</em></a>: <em>"When a file in the lower filesystem is accessed in a way that requires write-access... the file is first copied from the lower filesystem to the upper filesystem (copy_up)."</em></li>
            <li><a href="https://docs.docker.com/engine/storage/drivers/overlayfs-driver/#how-the-overlayfs-driver-works" target="_blank" rel="noopener">Docker Engine — <em>How the overlay2 driver works</em></a>: <em>"The performance impact of the copy_up operation can be significant for large files. For this reason, consider using Docker volumes for write-heavy workloads."</em></li>
          </ul>

          <div class="callout callout-note">
            <span class="callout-label">Nota</span>
            <p>Desde kernel 4.19 existe la opción <code>metacopy=on</code>, que permite copy-up <em>solo de metadatos</em> (permisos, ownership) sin copiar el contenido. Pero en cuanto se modifica el contenido del archivo, la copia completa sigue siendo inevitable.</p>
          </div>

          <p>Al eliminar un archivo de <code>lowerdir</code>, OverlayFS crea un <strong>whiteout</strong> en <code>upperdir</code>: un archivo de dispositivo de caracteres con major/minor 0,0 que actúa como "este archivo no existe":</p>

          <pre><code>rm /tmp/overlay/merged/lower-only.txt

ls -la /tmp/overlay/upper/
# c--------- 1 root root 0, 0 lower-only.txt  ← char device 0,0 = whiteout</code></pre>

          <h2>La configuración real de un contenedor Docker</h2>

          <pre><code>docker inspect demo | jq '.[0].GraphDriver'

{
  "Data": {
    "ID": "eb4982ca6e37f2c95ad5412c20e45a9b2c54b3f22c6e31513989bca7e5806fab",
    "LowerDir": "/var/lib/docker/overlay2/1629751375ad26b1a67d2cc9008985d421f2b48efe2b1990e94d2661a105dc79-init/diff:/var/lib/docker/overlay2/e30fade0c171491f998205340eea35c3d6feb2870c3da11602fea5e4eb592587/diff:/var/lib/docker/overlay2/60950e861baa6ad9a6fe59f71935f5c3f0d9457908547d35754d075bcbcee056/diff:/var/lib/docker/overlay2/957a97e1c487c04e116095368e478717b60bf2dff4acfea16c779fa9a7c453b3/diff:/var/lib/docker/overlay2/ab385398c1d6e6adcb340bc60f726644090a14e41c62b5ae6168db40594b6b9e/diff:/var/lib/docker/overlay2/0fe27ae5fe60703cf59b79ce1544c0cf5435768b13c383773dee6f4f8dae5099/diff:/var/lib/docker/overlay2/c97f8b48a1cc267f04d1d907cf0c2ec703f35d6a429b97e19914b5cbf186f85c/diff:/var/lib/docker/overlay2/86fe8cf33e603677274ce2bb98da06b5726a03e9b846d3f8897440619afa580d/diff:/var/lib/docker/overlay2/86efbbb5fd4fd3007e78af94c3bcdc247e68b30ac81b247b48890971ece5dc17/diff",
    "MergedDir": "/var/lib/docker/overlay2/1629751375ad26b1a67d2cc9008985d421f2b48efe2b1990e94d2661a105dc79/merged",
    "UpperDir": "/var/lib/docker/overlay2/1629751375ad26b1a67d2cc9008985d421f2b48efe2b1990e94d2661a105dc79/diff",
    "WorkDir": "/var/lib/docker/overlay2/1629751375ad26b1a67d2cc9008985d421f2b48efe2b1990e94d2661a105dc79/work"
  },
  "Name": "overlay2"
}</code></pre>

          <p>El <code>LowerDir</code> tiene 9 entradas separadas por <code>:</code> — cada una es una capa de la imagen nginx, ordenadas de más reciente a más antigua. Son inmutables y se comparten entre todos los contenedores que usen la misma imagen. Solo el <code>UpperDir</code> es único por contenedor.</p>

          <h2>La capa -init</h2>

          <p>Nótese la capa con sufijo <code>-init</code> al inicio del <code>LowerDir</code>. Docker la inserta entre la imagen y el <code>upperdir</code> del contenedor. Contiene archivos que Docker gestiona y que no deben persistir entre recreaciones del contenedor: <code>/etc/hostname</code>, <code>/etc/hosts</code>, <code>/etc/resolv.conf</code>. Es la capa que hace que cada contenedor tenga su propio hostname sin modificar la imagen base.</p>
        `,
  en: `
          <p>A Docker image is not a monolithic file. It is a stack of read-only layers. When you start a container, the runtime adds a read-write layer on top. All of this is <strong>OverlayFS</strong>, a union filesystem included in the kernel since version 3.18.</p>

          <h2>The four OverlayFS directories</h2>

          <pre><code>lowerdir  → read-only layers (the image)
upperdir  → read-write layer (container changes)
workdir   → internal working directory (same filesystem as upper)
merged    → the mount point the process sees</code></pre>

          <h2>Mounting an overlay manually</h2>

          <pre><code>mkdir -p /tmp/overlay/{lower,upper,work,merged}

# Base content in the lower layer
echo "original file" > /tmp/overlay/lower/file.txt
echo "lower only"    > /tmp/overlay/lower/lower-only.txt

# Mount the overlay
sudo mount -t overlay overlay \\
  -o lowerdir=/tmp/overlay/lower,\\
     upperdir=/tmp/overlay/upper,\\
     workdir=/tmp/overlay/work \\
  /tmp/overlay/merged</code></pre>

          <pre><code># From merged you see everything
cat /tmp/overlay/merged/file.txt        # "original file"
cat /tmp/overlay/merged/lower-only.txt  # "lower only"

# Modify a file
echo "modified" > /tmp/overlay/merged/file.txt

# The original in lower did NOT change
cat /tmp/overlay/lower/file.txt   # "original file"

# The modified copy is in upper (copy-on-write)
cat /tmp/overlay/upper/file.txt   # "modified"</code></pre>

          <h2>Copy-on-write (CoW)</h2>

          <p>The original file is never touched. On the first write, the kernel copies the <strong>entire file</strong> from the lower layer into <code>upperdir</code> (this is called <em>copy-up</em>) and applies the change to that copy. The lower layer remains immutable — this is what allows multiple containers to share the same image layers without interfering with each other.</p>

          <p>It is important to understand that copy-up happens at the <strong>whole-file</strong> level, not at the block level: writing 1 byte to a 1 GB file triggers copying all 1 GB into <code>upperdir</code>. This is why containers with databases or bulky logs benefit from volumes (<code>-v</code>) instead of writing on top of the overlay layer.</p>

          <p>Official references:</p>
          <ul>
            <li><a href="https://docs.kernel.org/filesystems/overlayfs.html#non-directories" target="_blank" rel="noopener">Linux kernel documentation — <em>overlayfs — Non-directories</em></a>: <em>"When a file in the lower filesystem is accessed in a way that requires write-access... the file is first copied from the lower filesystem to the upper filesystem (copy_up)."</em></li>
            <li><a href="https://docs.docker.com/engine/storage/drivers/overlayfs-driver/#how-the-overlayfs-driver-works" target="_blank" rel="noopener">Docker Engine — <em>How the overlay2 driver works</em></a>: <em>"The performance impact of the copy_up operation can be significant for large files. For this reason, consider using Docker volumes for write-heavy workloads."</em></li>
          </ul>

          <div class="callout callout-note">
            <span class="callout-label">Note</span>
            <p>Since kernel 4.19, the <code>metacopy=on</code> mount option enables metadata-only copy-up (permissions, ownership) without copying the contents. But the moment file contents are modified, the full copy becomes unavoidable.</p>
          </div>

          <p>When you delete a file from <code>lowerdir</code>, OverlayFS creates a <strong>whiteout</strong> in <code>upperdir</code>: a character device file with major/minor 0,0 that acts as "this file does not exist":</p>

          <pre><code>rm /tmp/overlay/merged/lower-only.txt

ls -la /tmp/overlay/upper/
# c--------- 1 root root 0, 0 lower-only.txt  ← char device 0,0 = whiteout</code></pre>

          <h2>The real configuration of a Docker container</h2>

          <pre><code>docker inspect demo | jq '.[0].GraphDriver'

{
  "Data": {
    "ID": "eb4982ca6e37f2c95ad5412c20e45a9b2c54b3f22c6e31513989bca7e5806fab",
    "LowerDir": "/var/lib/docker/overlay2/1629751375ad26b1a67d2cc9008985d421f2b48efe2b1990e94d2661a105dc79-init/diff:/var/lib/docker/overlay2/e30fade0c171491f998205340eea35c3d6feb2870c3da11602fea5e4eb592587/diff:/var/lib/docker/overlay2/60950e861baa6ad9a6fe59f71935f5c3f0d9457908547d35754d075bcbcee056/diff:/var/lib/docker/overlay2/957a97e1c487c04e116095368e478717b60bf2dff4acfea16c779fa9a7c453b3/diff:/var/lib/docker/overlay2/ab385398c1d6e6adcb340bc60f726644090a14e41c62b5ae6168db40594b6b9e/diff:/var/lib/docker/overlay2/0fe27ae5fe60703cf59b79ce1544c0cf5435768b13c383773dee6f4f8dae5099/diff:/var/lib/docker/overlay2/c97f8b48a1cc267f04d1d907cf0c2ec703f35d6a429b97e19914b5cbf186f85c/diff:/var/lib/docker/overlay2/86fe8cf33e603677274ce2bb98da06b5726a03e9b846d3f8897440619afa580d/diff:/var/lib/docker/overlay2/86efbbb5fd4fd3007e78af94c3bcdc247e68b30ac81b247b48890971ece5dc17/diff",
    "MergedDir": "/var/lib/docker/overlay2/1629751375ad26b1a67d2cc9008985d421f2b48efe2b1990e94d2661a105dc79/merged",
    "UpperDir": "/var/lib/docker/overlay2/1629751375ad26b1a67d2cc9008985d421f2b48efe2b1990e94d2661a105dc79/diff",
    "WorkDir": "/var/lib/docker/overlay2/1629751375ad26b1a67d2cc9008985d421f2b48efe2b1990e94d2661a105dc79/work"
  },
  "Name": "overlay2"
}</code></pre>

          <p>The <code>LowerDir</code> has 9 entries separated by <code>:</code> — each is a layer of the nginx image, ordered from most recent to oldest. They are immutable and shared among all containers using the same image. Only the <code>UpperDir</code> is unique per container.</p>

          <h2>The -init layer</h2>

          <p>Note the layer with the <code>-init</code> suffix at the beginning of <code>LowerDir</code>. Docker inserts it between the image and the container's <code>upperdir</code>. It contains files that Docker manages and that should not persist across container recreations: <code>/etc/hostname</code>, <code>/etc/hosts</code>, <code>/etc/resolv.conf</code>. This is the layer that gives each container its own hostname without modifying the base image.</p>
        `,
}
