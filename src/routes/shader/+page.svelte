<script>
  import { resolve } from '$app/paths';
</script>

<ol>
  <li><a href={resolve('/shader/hello-world')}>Hello world</a></li>
  <li><a href={resolve('/shader/remount')}>Remounting canvas</a></li>
  <li><a href={resolve('/shader/oversized-canvas')}>Oversized canvas</a></li>
  <li>
    <a href={resolve('/shader/landing-page-bubbles')}>Landing page with bubbles</a>
  </li>
  <li>
    <a href={resolve('/shader/landing-page-halo')}>Landing page with a halo</a>
  </li>
  <li><a href={resolve('/shader/slider')}>Slider component</a></li>
</ol>
