package chat.undelete.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DeviceArchivePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
