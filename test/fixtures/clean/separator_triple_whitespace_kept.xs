function "example" {
  input {
  }

  stack {
    api.lambda {
      code = """
          const crypto = require('crypto');
          
            class CBOR {
              constructor() {}
            
            }
          """
    } as $out
    var $prompt {
      value = """
        Translate.
        
        Keep this gap.
        """
    }
    db.query item {
      mock = {
        checkout: ```
          {id: 1}

          {id: 2}
          ```
      }
    } as $item
  }

  response = $out
}
