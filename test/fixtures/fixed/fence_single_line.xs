function "example" {
  input {
  }

  stack {
    function.run "Orders/dispatch" {
      input = {id: 1}

      mock = {
        "checkout empty cart": {queued: [], sent: [], done: false}
      }
    } as $dispatch
  }

  response = $dispatch

  test "cms author search text includes draft only title" {
    input = {
      internal_name: "Item"
      source       : {localized: {en_US: {title: "Live"}}}
      draft_source : {localized: {en_US: {title: "Draft Title"}}}
    }

    expect.to_equal ($response.search_text) {
      value = "item live draft title"
    }
  }

  test "cms author search text includes publisher and channel" {
    input = {
      internal_name: "Item"
      source       : {content: {channel_name: "PGA", publisher_name: "Golf Digest"}}
    }

    expect.to_equal ($response.search_text) {
      value = "item pga golf digest"
    }
  }
}
