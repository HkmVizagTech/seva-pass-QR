package in.harekrishnavizag.sevapass;

import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;

@CapacitorPlugin(name = "WhatsAppShare")
public class WhatsAppSharePlugin extends Plugin {

    @PluginMethod
    public void share(PluginCall call) {
        String base64 = call.getString("data");
        String phone = call.getString("phone", "");
        String text = call.getString("text", "");
        String filename = call.getString("filename", "pass.png");

        if (base64 == null || base64.isEmpty()) {
            call.reject("No image data provided");
            return;
        }

        try {
            // Decode base64 to bytes
            byte[] imageBytes = Base64.decode(base64, Base64.DEFAULT);

            // Write to cache directory
            File cacheDir = getContext().getCacheDir();
            File imageFile = new File(cacheDir, filename);
            FileOutputStream fos = new FileOutputStream(imageFile);
            fos.write(imageBytes);
            fos.close();

            // Get content URI via FileProvider
            Uri contentUri = androidx.core.content.FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    imageFile
            );

            // Build WhatsApp intent
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("image/png");
            intent.setPackage("com.whatsapp");
            intent.putExtra(Intent.EXTRA_STREAM, contentUri);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            if (!text.isEmpty()) {
                intent.putExtra(Intent.EXTRA_TEXT, text);
            }

            // Pre-select contact if phone number provided
            if (!phone.isEmpty()) {
                String digits = phone.replaceAll("[^0-9]", "");
                if (digits.length() == 10) {
                    digits = "91" + digits;
                }
                String jid = digits + "@s.whatsapp.net";
                intent.putExtra("jid", jid);
            }

            getActivity().startActivity(intent);

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);

        } catch (Exception e) {
            call.reject("WhatsApp share failed: " + e.getMessage());
        }
    }
}
