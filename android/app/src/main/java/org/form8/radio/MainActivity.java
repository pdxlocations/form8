package org.form8.radio;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle state) {
    registerPlugin(Form8LinkPlugin.class);
    super.onCreate(state);
  }
}
