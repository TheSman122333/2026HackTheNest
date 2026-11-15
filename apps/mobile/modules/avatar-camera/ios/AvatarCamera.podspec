Pod::Spec.new do |s|
  s.name = 'AvatarCamera'
  s.version = '0.1.0'
  s.summary = 'Private, local avatar photo capture and selection'
  s.description = 'Uses the system camera and photo picker; normalizes images in the app cache.'
  s.author = ''
  s.homepage = 'https://docs.expo.dev/modules/'
  s.platforms = { :ios => '16.4' }
  s.source = { git: '' }
  s.static_framework = true
  s.swift_version = '5.0'
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'PhotosUI', 'ImageIO', 'UIKit'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
