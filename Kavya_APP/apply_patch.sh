*** Begin Patch
*** Update File: E:\pinokio\api\Kavya_APP\kavya-web-deploy\index.html
--- E:\pinokio\api\Kavya_APP\kavya-web-deploy\index.html
+++ E:\pinokio\api\Kavya_APP\kavya-web-deploy\index.html
@@ -103,6 +103,26 @@
       transform: translateY(-1px);
     }
 
+    /* Live Video Panel Positioning */
+    #live-video-section {
+      position: absolute;
+      left: 31.5%; /* 360.045px / 1143px */
+      top: 39.9%; /* 817.152px / 2048px */
+      width: 47.6%; /* 544.188px / 1143px */
+      height: 33.4%; /* 684.032px / 2048px */
+      z-index: 50; /* Ensure it's above other content */
+      overflow: hidden; /* Clip video to the bounds */
+      display: none; /* Hidden by default, activated by JS */
+      border-radius: var(--radius-md); /* Match existing styles */
+      box-shadow: 0 0 30px rgba(0, 240, 255, 0.6); /* Add a subtle glow */
+    }
+
+    #live-stream-video {
+      width: 100%;
+      height: 100%;
+      object-fit: cover; /* Cover the entire container */
+    }
+
     /* Main Content Layout */
     .main-content {
       display: flex;
@@ -1134,7 +1154,7 @@
         <div class="header">
           <h3 class="panel-title"><i class="fa-solid fa-video"></i>Live Now</h3>
         </div>
-        <div class="panel-content">
+        <div class="panel-content" id="live-video-section">
           <video id="live-stream-video" autoplay muted playsinline controls></video>
           <div id="flying-emojis-container" class="flying-emojis-container"></div>
           <div class="live-interactions-bar">
*** End Patch
