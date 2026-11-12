package io.github.mrsnilloc.upsight;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UprightPlugin.class);   // our own small plugin: which screens may turn sideways
        super.onCreate(savedInstanceState);
    }
}
