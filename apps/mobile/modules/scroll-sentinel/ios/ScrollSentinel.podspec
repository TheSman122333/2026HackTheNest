Pod::Spec.new do |s|
  s.name           = 'ScrollSentinel'
  s.version        = '0.1.0'
  s.summary        = 'Short-form scroll tracking (iOS stub; Screen Time integration TBD)'
  s.description    = 'Short-form scroll tracking (iOS stub; Screen Time integration TBD)'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
